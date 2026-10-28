from __future__ import annotations

import csv
import io
import re
import shutil
import uuid
import zipfile

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import (
    Image,
    ImageFilter,
    ImageOps,
    UnidentifiedImageError,
)

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_file,
    send_from_directory,
)

from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename


# ============================================================
# Configuration
# ============================================================

APP_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = APP_DIR / "outputs"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
}

MAX_IMAGES_PER_BATCH = 300
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
PREVIEW_MAX_SIDE = 900

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
app.config["JSON_SORT_KEYS"] = False


# ============================================================
# Validation
# ============================================================

def valid_job_id(job_id: str) -> bool:
    return bool(re.fullmatch(r"[a-f0-9]{32}", job_id))


def safe_uploaded_name(filename: str) -> str:
    """
    Validate and sanitize an uploaded filename.
    """
    filename = (filename or "").replace("\\", "/")
    basename = Path(filename).name
    extension = Path(basename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            "Unsupported image format. "
            "Use PNG, JPG, JPEG, WEBP, BMP or TIFF."
        )

    cleaned = secure_filename(basename)

    if not cleaned:
        cleaned = f"image{extension}"

    if Path(cleaned).suffix.lower() != extension:
        cleaned = f"image{extension}"

    return cleaned


def unique_filename(filename: str, used_names: set[str]) -> str:
    """
    Avoid collisions when multiple uploaded images have the same name.
    """
    path = Path(filename)
    candidate = filename
    number = 2

    while candidate.casefold() in used_names:
        candidate = f"{path.stem}_{number}{path.suffix}"
        number += 1

    used_names.add(candidate.casefold())
    return candidate


def read_settings(form):
    """
    Read the settings from the current HTML form.

    The current interface sends:
        blur
        white_percent
    """
    try:
        blur = float(form.get("blur", 2.0))
        white_percent = float(form.get("white_percent", 16.0))
    except (TypeError, ValueError):
        raise ValueError("Please provide valid conversion settings.")

    if not np.isfinite(blur) or not 0 <= blur <= 20:
        raise ValueError("Blur strength must be between 0 and 20.")

    if not np.isfinite(white_percent) or not 1 <= white_percent <= 99:
        raise ValueError(
            "White pixel percentage must be between 1 and 99."
        )

    return blur, white_percent


# ============================================================
# Image loading
# ============================================================

def load_rgb_image(data: bytes) -> Image.Image:
    """
    Load an image, correct EXIF orientation and handle transparency.

    Transparent regions are composited onto white.
    """
    if not data:
        raise ValueError("The uploaded file is empty.")

    try:
        with Image.open(io.BytesIO(data)) as source:
            width, height = source.size

            if (
                width < 1
                or height < 1
                or width * height > MAX_IMAGE_PIXELS
            ):
                raise ValueError(
                    "Image dimensions exceed the 50-megapixel limit."
                )

            image = ImageOps.exif_transpose(source)
            image.load()

            width, height = image.size

            if (
                width < 1
                or height < 1
                or width * height > MAX_IMAGE_PIXELS
            ):
                raise ValueError(
                    "Image dimensions exceed the 50-megapixel limit."
                )

            if (
                "A" in image.getbands()
                or "transparency" in image.info
            ):
                rgba = image.convert("RGBA")

                white_background = Image.new(
                    "RGBA",
                    rgba.size,
                    (255, 255, 255, 255),
                )

                image = Image.alpha_composite(
                    white_background,
                    rgba,
                ).convert("RGB")
            else:
                image = image.convert("RGB")

            return image.copy()

    except ValueError:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ) as error:
        raise ValueError(
            "This file is not a readable image or is damaged."
        ) from error


# ============================================================
# Mooney generation
# ============================================================

def choose_threshold(
    grayscale: np.ndarray,
    target_white_percent: float,
):
    """
    Select a threshold that gets as close as possible to the
    requested percentage of white pixels.

    Pixels with intensity >= threshold become white.

    Equal-intensity pixels cannot be split into separate classes,
    so the exact target percentage is not always achievable.
    """
    histogram = np.bincount(
        grayscale.reshape(-1),
        minlength=256,
    )

    total_pixels = grayscale.size

    white_counts = np.cumsum(histogram[::-1])[::-1]

    percentages = (
        white_counts.astype(np.float64)
        / total_pixels
        * 100.0
    )

    differences = np.abs(
        percentages - target_white_percent
    )

    best_difference = float(differences.min())

    candidates = np.flatnonzero(
        np.isclose(
            differences,
            best_difference,
            atol=1e-10,
        )
    )

    # If equally close choices exist, prefer not to exceed the
    # requested white-pixel percentage.
    below_target = candidates[
        percentages[candidates] <= target_white_percent
    ]

    if below_target.size:
        threshold = int(below_target[-1])
    else:
        threshold = int(candidates[0])

    return threshold


def create_mooney(
    original: Image.Image,
    blur: float,
    white_percent: float,
):
    """
    Convert an RGB image into a black-and-white Mooney-style image.

    Steps:
        1. Grayscale conversion
        2. Gaussian blur
        3. Threshold selection
        4. Binary black-and-white conversion
    """
    grayscale_image = ImageOps.grayscale(original)

    if blur > 0:
        grayscale_image = grayscale_image.filter(
            ImageFilter.GaussianBlur(radius=blur)
        )

    grayscale = np.asarray(
        grayscale_image,
        dtype=np.uint8,
    )

    threshold = choose_threshold(
        grayscale,
        white_percent,
    )

    binary_pixels = np.where(
        grayscale >= threshold,
        255,
        0,
    ).astype(np.uint8)

    mooney_image = Image.fromarray(binary_pixels)

    actual_white_percent = (
        float(np.count_nonzero(binary_pixels == 255))
        / binary_pixels.size
        * 100.0
    )

    metadata = {
        "threshold": threshold,
        "target_white_percent": round(white_percent, 4),
        "actual_white_percent": round(
            actual_white_percent,
            4,
        ),
        "white_percent_difference": round(
            actual_white_percent - white_percent,
            4,
        ),
        "blur_radius": blur,
        "width": original.width,
        "height": original.height,
    }

    return mooney_image, metadata


# ============================================================
# Browser preview
# ============================================================

def create_preview(image: Image.Image) -> bytes:
    """
    Create a smaller PNG for the browser without modifying
    the full-resolution image stored in the dataset.
    """
    preview = image.copy()
    preview.thumbnail(
        (PREVIEW_MAX_SIDE, PREVIEW_MAX_SIDE),
        Image.Resampling.LANCZOS,
    )

    buffer = io.BytesIO()

    preview.save(
        buffer,
        format="PNG",
        optimize=True,
    )

    return buffer.getvalue()


def image_as_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()

    image.save(
        buffer,
        format="PNG",
        optimize=True,
    )

    return buffer.getvalue()


# ============================================================
# Batch processing
# ============================================================

def write_manifest(job_dir: Path, rows: list[dict]):
    manifest_path = job_dir / "manifest.csv"

    fields = [
        "original_filename",
        "mooney_filename",
        "status",
        "error",
        "blur_radius",
        "target_white_percent",
        "threshold",
        "actual_white_percent",
        "white_percent_difference",
        "width",
        "height",
    ]

    with manifest_path.open(
        "w",
        newline="",
        encoding="utf-8-sig",
    ) as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=fields,
            extrasaction="ignore",
        )

        writer.writeheader()
        writer.writerows(rows)

    return manifest_path


def build_results_zip(
    job_dir: Path,
    successful_count: int,
    failed_count: int,
):
    """
    Create the downloadable project archive.
    """
    zip_path = job_dir / "mooney_results.zip"

    readme = (
        "CompVP Mooney Studio - Batch Results\n"
        f"Created UTC: {datetime.now(timezone.utc).isoformat()}\n"
        f"Successful conversions: {successful_count}\n"
        f"Failed or skipped files: {failed_count}\n\n"
        "Original/ contains uploaded source image files.\n"
        "Mooney/ contains generated black-and-white PNG images.\n"
        "manifest.csv records processing settings and measurements.\n\n"
        "Processing uses grayscale conversion, optional Gaussian blur,\n"
        "and binary intensity thresholding. Pixels at or above the\n"
        "selected threshold become white.\n\n"
        "The target white percentage may differ from the actual\n"
        "percentage when multiple pixels share the same intensity.\n"
        "Review actual_white_percent in manifest.csv.\n\n"
        "The original research paper uses Gaussian filtering and a\n"
        "16% white-pixel target. Your results should be inspected and\n"
        "the settings used for your dataset should be reported.\n"
    )

    with zipfile.ZipFile(
        zip_path,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=5,
    ) as archive:

        for folder_name in ("Original", "Mooney"):
            folder = job_dir / folder_name

            for path in folder.iterdir():
                if path.is_file():
                    archive.write(
                        path,
                        arcname=f"{folder_name}/{path.name}",
                    )

        archive.write(
            job_dir / "manifest.csv",
            arcname="manifest.csv",
        )

        archive.writestr(
            "README.txt",
            readme,
        )

    return zip_path


# ============================================================
# Routes
# ============================================================

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "app": "Mooney Studio",
    })


@app.post("/process")
def process_images():
    """
    Endpoint used by the current app.js.

    Returns:
        images
        count
        warnings
        download_url
    """
    try:
        blur, white_percent = read_settings(request.form)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    uploads = [
        file
        for file in request.files.getlist("images")
        if file and file.filename and file.filename.strip()
    ]

    if not uploads:
        return jsonify({
            "error": "Please select at least one image."
        }), 400

    if len(uploads) > MAX_IMAGES_PER_BATCH:
        return jsonify({
            "error": (
                f"A maximum of {MAX_IMAGES_PER_BATCH} "
                "images is allowed per batch."
            )
        }), 400

    job_id = uuid.uuid4().hex
    job_dir = OUTPUT_DIR / job_id

    original_dir = job_dir / "Original"
    mooney_dir = job_dir / "Mooney"
    preview_dir = job_dir / "Preview"

    for directory in (
        original_dir,
        mooney_dir,
        preview_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    results = []
    warnings = []
    manifest_rows = []

    used_original_names = set()
    used_mooney_names = set()

    successful = 0
    failed = 0

    try:
        for index, upload in enumerate(uploads, start=1):
            raw_filename = upload.filename or f"image_{index}.png"

            try:
                safe_name = safe_uploaded_name(raw_filename)
            except ValueError as error:
                warnings.append(
                    f"{Path(raw_filename).name}: {error}"
                )

                manifest_rows.append({
                    "original_filename": Path(
                        raw_filename.replace("\\", "/")
                    ).name[:200],
                    "mooney_filename": "",
                    "status": "skipped",
                    "error": str(error),
                    "blur_radius": blur,
                    "target_white_percent": white_percent,
                })

                failed += 1
                continue

            try:
                raw_bytes = upload.read()

                if not raw_bytes:
                    raise ValueError("The uploaded file is empty.")

                original_image = load_rgb_image(raw_bytes)

                safe_name = unique_filename(
                    safe_name,
                    used_original_names,
                )

                output_stem = Path(safe_name).stem

                mooney_name = unique_filename(
                    f"{output_stem}_mooney.png",
                    used_mooney_names,
                )

                preview_name = f"{index:03d}_preview.png"

                # Keep the original uploaded file unchanged.
                (original_dir / safe_name).write_bytes(raw_bytes)

                # Generate the Mooney image at full resolution.
                mooney_image, metadata = create_mooney(
                    original_image,
                    blur,
                    white_percent,
                )

                mooney_image.save(
                    mooney_dir / mooney_name,
                    format="PNG",
                    optimize=True,
                )

                # Create browser previews.
                original_preview = create_preview(original_image)
                mooney_preview = create_preview(mooney_image)

                (preview_dir / preview_name).write_bytes(
                    original_preview
                )

                mooney_preview_name = (
                    f"{Path(mooney_name).stem}_preview.png"
                )

                (preview_dir / mooney_preview_name).write_bytes(
                    mooney_preview
                )

                results.append({
                    "original_name": safe_name,
                    "mooney_name": mooney_name,
                    "original_url": (
                        f"/media/{job_id}/Preview/{preview_name}"
                    ),
                    "mooney_url": (
                        f"/media/{job_id}/Preview/"
                        f"{mooney_preview_name}"
                    ),
                })

                manifest_rows.append({
                    "original_filename": safe_name,
                    "mooney_filename": mooney_name,
                    "status": "success",
                    "error": "",
                    "blur_radius": blur,
                    "target_white_percent": white_percent,
                    "threshold": metadata["threshold"],
                    "actual_white_percent": (
                        metadata["actual_white_percent"]
                    ),
                    "white_percent_difference": (
                        metadata["white_percent_difference"]
                    ),
                    "width": metadata["width"],
                    "height": metadata["height"],
                })

                successful += 1

            except (
                ValueError,
                OSError,
                UnidentifiedImageError,
                Image.DecompressionBombError,
            ) as error:
                message = str(error)[:250]

                warnings.append(
                    f"{Path(raw_filename).name}: {message}"
                )

                manifest_rows.append({
                    "original_filename": Path(
                        raw_filename.replace("\\", "/")
                    ).name[:200],
                    "mooney_filename": "",
                    "status": "failed",
                    "error": message,
                    "blur_radius": blur,
                    "target_white_percent": white_percent,
                })

                app.logger.warning(
                    "Image conversion failed for %s: %s",
                    raw_filename,
                    message,
                )

            except Exception:
                app.logger.exception(
                    "Unexpected error while processing %s",
                    raw_filename,
                )

                warnings.append(
                    f"{Path(raw_filename).name}: processing failed."
                )

                manifest_rows.append({
                    "original_filename": Path(
                        raw_filename.replace("\\", "/")
                    ).name[:200],
                    "mooney_filename": "",
                    "status": "failed",
                    "error": "Unexpected processing error.",
                    "blur_radius": blur,
                    "target_white_percent": white_percent,
                })

                failed += 1
                continue

        if successful == 0:
            shutil.rmtree(job_dir, ignore_errors=True)

            return jsonify({
                "error": "No images could be converted.",
                "warnings": warnings,
            }), 400

        write_manifest(job_dir, manifest_rows)

        build_results_zip(
            job_dir,
            successful,
            failed,
        )

        return jsonify({
            "images": results,
            "count": successful,
            "warnings": warnings,
            "download_url": f"/download/{job_id}",
        })

    except Exception:
        app.logger.exception("Batch processing failed")
        shutil.rmtree(job_dir, ignore_errors=True)

        return jsonify({
            "error": (
                "Conversion failed unexpectedly. "
                "Check the PowerShell terminal for details."
            )
        }), 500


# ============================================================
# Image preview endpoint
# ============================================================

@app.get("/media/<job_id>/<folder>/<filename>")
def get_media(job_id, folder, filename):
    if not valid_job_id(job_id):
        return "Not found", 404

    if folder not in {"Preview", "Mooney"}:
        return "Not found", 404

    directory = OUTPUT_DIR / job_id / folder

    if not directory.is_dir():
        return "Not found", 404

    return send_from_directory(
        directory,
        filename,
        conditional=True,
        max_age=0,
    )


# ============================================================
# ZIP download endpoint
# ============================================================

@app.get("/download/<job_id>")
def download_results(job_id):
    if not valid_job_id(job_id):
        return "Not found", 404

    zip_path = OUTPUT_DIR / job_id / "mooney_results.zip"

    if not zip_path.is_file():
        return "Results not found", 404

    return send_file(
        zip_path,
        mimetype="application/zip",
        as_attachment=True,
        download_name="mooney_results.zip",
        max_age=0,
    )


# ============================================================
# Error handling
# ============================================================

@app.errorhandler(RequestEntityTooLarge)
def handle_upload_too_large(_error):
    return jsonify({
        "error": (
            "Upload exceeds 200 MB. "
            "Please convert your images in smaller batches."
        )
    }), 413


@app.errorhandler(404)
def handle_not_found(_error):
    return jsonify({
        "error": "The requested resource was not found."
    }), 404


# ============================================================
# Start application
# ============================================================

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
    )