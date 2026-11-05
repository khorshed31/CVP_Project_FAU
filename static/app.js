
"use strict";

/* ELEMENTS */

const form = document.getElementById("converterForm");
const imageInput = document.getElementById("images");
const dropZone = document.getElementById("dropZone");

const blurInput = document.getElementById("blur");
const whiteInput = document.getElementById("whitePercent");
const blurValue = document.getElementById("blurValue");
const whiteValue = document.getElementById("whiteValue");

const selectionSummary = document.getElementById("selectionSummary");
const fileCount = document.getElementById("fileCount");
const fileSize = document.getElementById("fileSize");
const clearFilesButton = document.getElementById("clearFiles");

const convertButton = document.getElementById("convertButton");
const convertButtonText = document.getElementById("convertButtonText");

const statusBox = document.getElementById("statusBox");
const statusText = document.getElementById("status");
const statusIndicator = document.getElementById("statusIndicator");

const emptyState = document.getElementById("emptyState");
const resultsGrid = document.getElementById("resultsGrid");
const resultCount = document.getElementById("resultCount");
const previewDescription = document.getElementById("previewDescription");

const downloadButton = document.getElementById("downloadButton");
const downloadFooter = document.getElementById("downloadFooter");
const downloadFooterButton = document.getElementById("downloadFooterButton");

let currentDownloadURL = "";


/* FILE SIZE */

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) {
        return "0 MB";
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


/* SETTINGS LABELS */

function updateSettingsLabels() {
    blurValue.textContent = Number(blurInput.value).toFixed(1);
    whiteValue.textContent = `${whiteInput.value}%`;
}

blurInput.addEventListener("input", updateSettingsLabels);
whiteInput.addEventListener("input", updateSettingsLabels);


/* STATUS MESSAGE */

function showStatus(message, type = "normal") {
    statusBox.hidden = !message;
    statusText.textContent = message;

    statusBox.classList.remove("success", "error");

    if (type === "success" || type === "error") {
        statusBox.classList.add(type);
    }

    statusIndicator.setAttribute("aria-hidden", "true");
}


/* CLEAR PREVIOUS RESULTS */

function clearPreviousResults() {
    resultsGrid.replaceChildren();

    resultCount.textContent = "0";
    emptyState.hidden = false;

    downloadButton.hidden = true;
    downloadFooter.hidden = true;

    previewDescription.textContent =
        "Your original and converted images will appear here.";

    currentDownloadURL = "";

    downloadButton.removeAttribute("href");
    downloadFooterButton.removeAttribute("href");
}


/* SELECTED FILE INFORMATION */

function updateSelectedFiles() {
    const files = Array.from(imageInput.files || []);

    if (files.length === 0) {
        selectionSummary.hidden = true;
        return;
    }

    const totalBytes = files.reduce(
        (sum, file) => sum + file.size,
        0
    );

    fileCount.textContent =
        `${files.length} image${files.length === 1 ? "" : "s"} selected`;

    fileSize.textContent = formatBytes(totalBytes);

    selectionSummary.hidden = false;
}


/* DRAG AND DROP FILE SELECTION */

function setFiles(files) {
    const accepted = Array.from(files).filter(file =>
        file.type.startsWith("image/")
    );

    if (accepted.length === 0) {
        showStatus("Please select supported image files.", "error");
        return;
    }

    const transfer = new DataTransfer();

    accepted.forEach(file => {
        transfer.items.add(file);
    });

    imageInput.files = transfer.files;

    clearPreviousResults();
    updateSelectedFiles();

    showStatus(
        `${accepted.length} image${accepted.length === 1 ? "" : "s"} selected.`
    );
}


/* FILE INPUT EVENT */

imageInput.addEventListener("change", () => {
    if (imageInput.files.length > 0) {
        updateSelectedFiles();
        clearPreviousResults();

        showStatus(
            `${imageInput.files.length} image${imageInput.files.length === 1 ? "" : "s"} selected.`
        );
    } else {
        updateSelectedFiles();
    }
});


/* CLEAR SELECTED FILES */

clearFilesButton.addEventListener("click", () => {
    imageInput.value = "";

    updateSelectedFiles();
    clearPreviousResults();

    showStatus("");
});


/* DRAG EVENTS */

["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
    });
});

["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");
    });
});

dropZone.addEventListener("drop", event => {
    const files = event.dataTransfer?.files;

    if (files && files.length > 0) {
        setFiles(files);
    }
});


/* DOWNLOAD BUTTON CREATION */

function makeDownloadLink(
    url,
    filename,
    label,
    isMooney = false
) {
    const link = document.createElement("a");

    link.className = "image-download";
    link.href = url;
    link.download = filename;
    link.setAttribute("aria-label", label);

    const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
    );

    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");

    const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
    );

    path.setAttribute(
        "d",
        "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"
    );

    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    icon.appendChild(path);

    const text = document.createElement("span");

    text.textContent = isMooney
        ? "Download Mooney"
        : "Download original";

    link.append(icon, text);

    return link;
}


/* IMAGE CAPTION WITH ORIGINAL FILENAME */

function createImageCaption(label, originalFilename, isMooney = false) {
    const caption = document.createElement("figcaption");

    const dot = document.createElement("span");

    dot.className = isMooney
        ? "caption-dot mooney"
        : "caption-dot";

    dot.setAttribute("aria-hidden", "true");

    const labelText = document.createElement("span");

    labelText.className = "image-kind";
    labelText.textContent = label;

    /*
       IMPORTANT:
       The same original filename is displayed
       on both Original and Mooney image captions.
    */

    const filename = document.createElement("span");

    filename.className = "image-filename";
    filename.textContent = originalFilename;
    filename.title = originalFilename;

    caption.append(dot, labelText, filename);

    return caption;
}


/* CREATE IMAGE CARD */

function createImageCard(item, index) {
    const card = document.createElement("article");

    card.className = "image-card";


    /*
       Original uploaded filename.
       Example: face_021.jpg
    */

    const originalName =
        item.original_name ||
        item.filename ||
        `original_${index + 1}.jpg`;


    /*
       Generated Mooney filename is used for
       the Mooney download button.

       The visible Mooney caption still displays
       the original uploaded filename.
    */

    const mooneyName =
        item.mooney_name ||
        `mooney_${index + 1}.png`;

    const originalURL = item.original_url;
    const mooneyURL = item.mooney_url;


    /* CARD HEADER */

    const header = document.createElement("div");

    header.className = "card-header";

    const title = document.createElement("h2");

    title.textContent = originalName;
    title.title = originalName;

    const number = document.createElement("span");

    number.className = "card-number";

    number.textContent =
        `#${String(index + 1).padStart(3, "0")}`;

    header.append(title, number);


    /* IMAGE PAIR */

    const pair = document.createElement("div");

    pair.className = "image-pair";


    /* ---------------------------------
       ORIGINAL IMAGE
    --------------------------------- */

    const originalFigure = document.createElement("figure");

    originalFigure.appendChild(
        createImageCaption(
            "Original",
            originalName,
            false
        )
    );

    const originalFrame = document.createElement("div");

    originalFrame.className = "image-frame";

    const originalImage = document.createElement("img");

    originalImage.src = originalURL;

    originalImage.alt =
        `Original image: ${originalName}`;

    originalImage.loading = "lazy";

    originalFrame.appendChild(originalImage);

    originalFigure.appendChild(originalFrame);


    /* ---------------------------------
       MOONEY IMAGE
    --------------------------------- */

    const mooneyFigure = document.createElement("figure");

    mooneyFigure.appendChild(
        createImageCaption(
            "Mooney",
            originalName,
            true
        )
    );

    const mooneyFrame = document.createElement("div");

    mooneyFrame.className = "image-frame mooney-frame";

    const mooneyImage = document.createElement("img");

    mooneyImage.src = mooneyURL;

    mooneyImage.alt =
        `Mooney version of ${originalName}`;

    mooneyImage.loading = "lazy";

    mooneyFrame.appendChild(mooneyImage);

    mooneyFigure.appendChild(mooneyFrame);


    /* ADD BOTH IMAGES */

    pair.append(originalFigure, mooneyFigure);


    /* DOWNLOAD BUTTONS */

    const actions = document.createElement("div");

    actions.className = "image-actions";

    actions.append(
        makeDownloadLink(
            originalURL,
            originalName,
            `Download original ${originalName}`,
            false
        ),

        makeDownloadLink(
            mooneyURL,
            mooneyName,
            `Download Mooney image generated from ${originalName}`,
            true
        )
    );


    /* FINAL CARD */

    card.append(header, pair, actions);

    return card;
}


/* RENDER ALL RESULTS */

function renderResults(images) {
    const fragment = document.createDocumentFragment();

    images.forEach((item, index) => {
        if (!item.original_url || !item.mooney_url) {
            throw new Error(
                `Image ${index + 1} is missing an image URL.`
            );
        }

        fragment.appendChild(
            createImageCard(item, index)
        );
    });

    resultsGrid.replaceChildren(fragment);

    resultCount.textContent = String(images.length);

    emptyState.hidden = images.length > 0;

    previewDescription.textContent =
        `${images.length} image pair${images.length === 1 ? "" : "s"} converted successfully.`;
}


/* MAIN CONVERSION FORM */

form.addEventListener("submit", async event => {
    event.preventDefault();


    /* Check selected images */

    if (!imageInput.files.length) {
        showStatus(
            "Please select at least one image.",
            "error"
        );

        imageInput.focus();

        return;
    }


    /* Check total upload size */

    const totalSize = Array.from(imageInput.files).reduce(
        (sum, file) => sum + file.size,
        0
    );

    if (totalSize > 100 * 1024 * 1024) {
        showStatus(
            "Total upload size exceeds the 100 MB limit.",
            "error"
        );

        return;
    }


    /* Start conversion */

    clearPreviousResults();

    convertButton.disabled = true;

    convertButtonText.textContent =
        "Converting images...";

    showStatus(
        "Processing images. Please keep this page open."
    );


    try {
        const formData = new FormData(form);

        const response = await fetch("/process", {
            method: "POST",
            body: formData
        });


        /* Read server response */

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "Invalid server response. Please check your Flask backend."
            );
        }


        /* Check server errors */

        if (!response.ok) {
            throw new Error(
                data.error || "Image conversion failed."
            );
        }


        /* Check converted images */

        if (
            !Array.isArray(data.images) ||
            data.images.length === 0
        ) {
            throw new Error("No images were converted.");
        }


        /* Render image cards */

        renderResults(data.images);


        /* Set ZIP download links */

        if (data.download_url) {
            currentDownloadURL = data.download_url;

            downloadButton.href = currentDownloadURL;

            downloadButton.download =
                "mooney_results.zip";

            downloadButton.hidden = false;


            downloadFooterButton.href =
                currentDownloadURL;

            downloadFooterButton.download =
                "mooney_results.zip";

            downloadFooter.hidden = false;
        }


        /* Success message */

        const convertedCount =
            Number(data.count) || data.images.length;

        let message =
            `${convertedCount} image${convertedCount === 1 ? "" : "s"} converted successfully.`;

        if (
            Array.isArray(data.warnings) &&
            data.warnings.length > 0
        ) {
            message +=
                ` ${data.warnings.length} file(s) were skipped.`;
        }

        showStatus(message, "success");


    } catch (error) {

        showStatus(
            error.message ||
            "Something went wrong. Please try again.",
            "error"
        );

    } finally {

        convertButton.disabled = false;

        convertButtonText.textContent =
            "Convert images";
    }
});


/* INITIALIZE PAGE */

updateSettingsLabels();
updateSelectedFiles();
