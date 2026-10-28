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

function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function updateSettingsLabels() {
    blurValue.textContent = Number(blurInput.value).toFixed(1);
    whiteValue.textContent = `${whiteInput.value}%`;
}

blurInput.addEventListener("input", updateSettingsLabels);
whiteInput.addEventListener("input", updateSettingsLabels);

function showStatus(message, type = "normal") {
    statusBox.hidden = !message;
    statusText.textContent = message;

    statusBox.classList.remove("success", "error");

    if (type === "success") {
        statusBox.classList.add("success");
    } else if (type === "error") {
        statusBox.classList.add("error");
    }

    statusIndicator.setAttribute("aria-hidden", "true");
}

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

function updateSelectedFiles() {
    const files = Array.from(imageInput.files || []);

    if (files.length === 0) {
        selectionSummary.hidden = true;
        return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    fileCount.textContent =
        `${files.length} image${files.length === 1 ? "" : "s"} selected`;

    fileSize.textContent = formatBytes(totalBytes);
    selectionSummary.hidden = false;
}

function setFiles(files) {
    const accepted = Array.from(files).filter(file =>
        file.type.startsWith("image/")
    );

    if (accepted.length === 0) {
        showStatus("Please select supported image files.", "error");
        return;
    }

    const transfer = new DataTransfer();

    accepted.forEach(file => transfer.items.add(file));
    imageInput.files = transfer.files;

    clearPreviousResults();
    updateSelectedFiles();
    showStatus(
        `${accepted.length} image${accepted.length === 1 ? "" : "s"} selected.`
    );
}

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

clearFilesButton.addEventListener("click", () => {
    imageInput.value = "";
    updateSelectedFiles();
    clearPreviousResults();
    showStatus("");
});

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

    if (files && files.length) {
        setFiles(files);
    }
});

function makeDownloadLink(url, filename, label, isMooney = false) {
    const link = document.createElement("a");
    link.className = "image-download";
    link.href = url;
    link.download = filename;
    link.setAttribute("aria-label", label);

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    icon.appendChild(path);

    const text = document.createElement("span");
    text.textContent = isMooney ? "Download Mooney" : "Download original";

    link.append(icon, text);
    return link;
}

function createImageCard(item, index) {
    const card = document.createElement("article");
    card.className = "image-card";

    const header = document.createElement("div");
    header.className = "card-header";

    const title = document.createElement("h2");
    title.textContent = item.original_name || `Image ${index + 1}`;

    const number = document.createElement("span");
    number.className = "card-number";
    number.textContent = `#${String(index + 1).padStart(3, "0")}`;

    header.append(title, number);

    const pair = document.createElement("div");
    pair.className = "image-pair";

    const originalFigure = document.createElement("figure");
    const originalCaption = document.createElement("figcaption");
    const originalDot = document.createElement("span");
    originalDot.className = "caption-dot";

    originalCaption.append(originalDot, document.createTextNode("Original"));

    const originalFrame = document.createElement("div");
    originalFrame.className = "image-frame";

    const originalImage = document.createElement("img");
    originalImage.src = item.original_url;
    originalImage.alt = `Original image ${index + 1}`;
    originalImage.loading = "lazy";

    originalFrame.appendChild(originalImage);
    originalFigure.append(originalCaption, originalFrame);

    const mooneyFigure = document.createElement("figure");
    const mooneyCaption = document.createElement("figcaption");
    const mooneyDot = document.createElement("span");
    mooneyDot.className = "caption-dot mooney";

    mooneyCaption.append(mooneyDot, document.createTextNode("Mooney"));

    const mooneyFrame = document.createElement("div");
    mooneyFrame.className = "image-frame mooney-frame";

    const mooneyImage = document.createElement("img");
    mooneyImage.src = item.mooney_url;
    mooneyImage.alt = `Mooney image ${index + 1}`;
    mooneyImage.loading = "lazy";

    mooneyFrame.appendChild(mooneyImage);
    mooneyFigure.append(mooneyCaption, mooneyFrame);

    pair.append(originalFigure, mooneyFigure);

    const actions = document.createElement("div");
    actions.className = "image-actions";

    actions.append(
        makeDownloadLink(
            item.original_url,
            item.original_name || `original_${index + 1}.png`,
            `Download original image ${index + 1}`
        ),
        makeDownloadLink(
            item.mooney_url,
            item.mooney_name || `mooney_${index + 1}.png`,
            `Download Mooney image ${index + 1}`,
            true
        )
    );

    card.append(header, pair, actions);
    return card;
}

function renderResults(images) {
    const fragment = document.createDocumentFragment();

    images.forEach((item, index) => {
        fragment.appendChild(createImageCard(item, index));
    });

    resultsGrid.replaceChildren(fragment);

    resultCount.textContent = String(images.length);
    emptyState.hidden = images.length > 0;

    previewDescription.textContent =
        `${images.length} image pair${images.length === 1 ? "" : "s"} converted successfully.`;
}

form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!imageInput.files.length) {
        showStatus("Please select at least one image.", "error");
        imageInput.focus();
        return;
    }

    const totalSize = Array.from(imageInput.files)
        .reduce((sum, file) => sum + file.size, 0);

    if (totalSize > 100 * 1024 * 1024) {
        showStatus("Total upload size exceeds the 100 MB limit.", "error");
        return;
    }

    clearPreviousResults();

    convertButton.disabled = true;
    convertButtonText.textContent = "Converting images...";
    showStatus("Processing images. Please keep this page open.");

    try {
        const formData = new FormData(form);

        const response = await fetch("/process", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Image conversion failed.");
        }

        if (!Array.isArray(data.images) || data.images.length === 0) {
            throw new Error("No images were converted.");
        }

        renderResults(data.images);

        currentDownloadURL = data.download_url;

        downloadButton.href = currentDownloadURL;
        downloadButton.download = "mooney_results.zip";
        downloadButton.hidden = false;

        downloadFooterButton.href = currentDownloadURL;
        downloadFooterButton.download = "mooney_results.zip";
        downloadFooter.hidden = false;

        let message =
            `${data.count} image${data.count === 1 ? "" : "s"} converted successfully.`;

        if (data.warnings && data.warnings.length) {
            message += ` ${data.warnings.length} file(s) were skipped.`;
        }

        showStatus(message, "success");
    } catch (error) {
        showStatus(
            error.message || "Something went wrong. Please try again.",
            "error"
        );
    } finally {
        convertButton.disabled = false;
        convertButtonText.textContent = "Convert images";
    }
});

updateSettingsLabels();
updateSelectedFiles();