# CompVP Mooney Studio

A local web app for the FAU Computational Visual Perception project. It uses a Python/Flask backend and HTML/CSS/JavaScript frontend to generate black-and-white Mooney-style images from one or many originals.

## Features

- Upload multiple JPG, JPEG, PNG, BMP, TIFF or WEBP files.
- Preview the first selected image and its Mooney-style output.
- Adjust Gaussian blur kernel, blur strength (`sigma`), and target white-pixel percentage.
- Batch-process up to 300 images per batch (200 MB total upload limit).
- Download a ZIP containing `Original/`, `Mooney/`, `manifest.csv`, and a README.
- The manifest records each input/output pair, settings, threshold and achieved white-pixel proportion.
- Image processing is performed by your own computer; uploaded image files are not sent to a remote service.

## Windows setup

1. Install Python 3.10 or newer from https://www.python.org/downloads/ . During installation, enable **Add Python to PATH** if the installer offers it.
2. Extract this folder somewhere writable, such as your Documents folder.
3. Open PowerShell in the extracted `compvp_mooney_webapp` folder.
4. Create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

5. Start the app:

   ```powershell
   python app.py
   ```

6. Open this address in your browser: **http://127.0.0.1:5000**
7. When finished, stop the server with `Ctrl+C` in PowerShell.

You can alternatively double-click `run_windows.bat`; on first use it creates the virtual environment and installs the dependencies automatically.

## macOS / Linux setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000 . Stop the server with `Ctrl+C`.

## How to use

1. Add a few images for testing (start with five) or drag them into the upload area.
2. Set the blur kernel, `sigma`, and target white-pixel percentage.
3. Select **Generate preview** and inspect the resulting black-and-white image.
4. Adjust settings until the output preserves useful structure. The best settings depend on your source images.
5. Select **Convert selected images**. The browser downloads `compvp_mooney_results.zip`.
6. Open the ZIP and check `manifest.csv`. Review the `status` and `actual_white_percent` columns and inspect the images manually.
7. For the course submission, ensure you eventually have 100 original images, 100 Mooney images, the selected 10 pairs, system results, and your presentation. This web app only generates the original/Mooney folders; it does not run the required vision systems or produce the final presentation.

## Parameters and research note

- **Blur kernel**: an odd size (for example 7 x 7) used by Gaussian blur.
- **Sigma**: the Gaussian blur strength. Larger values generally create stronger smoothing for a given kernel, but inspect the preview rather than assuming one setting is best.
- **Target white pixels**: the code chooses the 8-bit threshold whose proportion of pixels at or above that threshold is closest to the requested target. Due to repeated pixel intensities, the achieved percentage may not equal the requested percentage exactly; see `manifest.csv`.

The supplied Paper 1 describes Gaussian filtering and thresholding for Mooney faces and reports a 7 x 7 filter, sigma = 35, and a target of 16% white pixels for its stimuli. These values are useful as a paper-specific reference, not a guarantee of best results for every dataset. For comparison, the UI's default sigma is 2. Adjust and report the settings used in your experiments.

## Privacy / security

The server binds to `127.0.0.1` (loopback) so it is intended for local use. Do not change this to `0.0.0.0` or expose it publicly without adding appropriate security controls.

## Troubleshooting

- **`py` is not recognized**: reinstall Python and enable the PATH option, or use the Python launcher available on your system.
- **PowerShell blocks activation**: use `run_windows.bat`, or follow the OS-specific virtual-environment instructions from your university.
- **Upload too large**: split the dataset into multiple batches, then combine the outputs carefully.
- **An image fails**: check the `manifest.csv` error column, confirm the file opens normally, and try exporting it as JPG or PNG.
- **Outputs look almost all black/white**: test another sigma and white percentage, inspect the preview, and document the settings that work for your data.
