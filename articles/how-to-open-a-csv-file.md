# How to Open Large CSV Files with NanoCell CSV

> CSV files are a universal data table format, so why is it complicated to open them? NanoCell CSV provides a fast, verbatim, and lightweight solution—especially when previewing multi-gigabyte datasets.

CSV files are the universal medium for moving tabular data between databases, analytics pipelines, and Git repositories.

Yet despite how common they are, traditional tools struggle with them. Opening a CSV in Microsoft Excel can be slow, misdetect delimiters or encodings, truncate files over 1 million rows, and silently corrupt data by stripping leading zeros (`02138`) or turning `+` phone numbers into broken formulas.

This is where [NanoCell CSV](https://nanocell-csv.com/) comes in.

## Launching or Installing NanoCell CSV

You can use NanoCell CSV immediately in your browser at [nanocell-csv.com/app/home.html](https://nanocell-csv.com/app/home.html), or install it as an offline Desktop App (PWA) with native OS file associations:

1. Go to [https://nanocell-csv.com/](https://nanocell-csv.com/) in Chrome, Edge, Brave, or any Chromium-based desktop browser.
2. Click **Install** in the top navigation bar.
3. Confirm the browser prompt.
4. Done—NanoCell installs as a standalone desktop application!

> No `.exe` or `.dmg` installer requiring administrator permissions
> 100% offline & client-side execution (zero bytes uploaded)
> Instant startup

## Opening a CSV or TSV File from Your OS

Once installed as a Desktop PWA, [NanoCell CSV](https://nanocell-csv.com/) registers as a native file handler for `.csv` and `.tsv` files. Double-clicking a CSV file opens it directly in NanoCell.

To make NanoCell your default CSV opener:
- Right-click any `.csv` file
- Select `Open with...` &rarr; `Choose another app`
- Select **NanoCell CSV** and click `Always`

NanoCell automatically detects your file's delimiter (`,`, `;`, `TAB`, or `|`) and character encoding (`UTF-8`, `UTF-16LE/BE`, `Shift-JIS`, `GB18030`, `Windows-1251/1252`) on open.

## Customizing Your Workspace (`Ctrl+,`)

Click the Settings icon in the top-right corner (or press `Ctrl+,`) to tailor the editor to your workflow:

![settings-icon](/article-assets/settings.svg)

- **7 Built-In Themes:** Switch between `Nord`, `Light`, `Slate`, `Dark`, `Solarized`, `Night`, and `Dracula`.
- **Grid & Typography:** Adjust visible rows, columns, and font size, or open the fuzzy Command Palette (`Ctrl+K` or `Ctrl+P`) to access any action by keyboard.
- **CSV Open & Save Rules:** Configure delimiter, encoding, fixed-width padding, header freezing (`Ctrl+B`), and Strict RFC 4180 Save Guard.

## What If the File Is Huge—Say 5 GB or 20 GB?

[NanoCell CSV](https://nanocell-csv.com/) has no file size limit. When you open a file larger than the editable threshold (configurable in Settings, 10 MB by default), NanoCell automatically switches to **O(1) Large-File View-Only Mode** inside a background Web Worker.

Even a 20 GB file opens in milliseconds by sampling the header, evenly spaced interval chunks across the file, and the footer—without loading the entire dataset into RAM. You can also customize the number of sampled chunks and rows per chunk in Settings (`Ctrl+,`).

Editing multi-gigabyte tables manually in a spreadsheet is error-prone and belongs in reproducible ETL pipelines (`Pandas`, `Polars`, `DuckDB`, `PySpark`, or `SQL`). NanoCell locks large files in safe **View-Only** mode so you can inspect schemas, delimiters, encodings, and sample records instantaneously without ever risking accidental file corruption.

> No file size limit
> Millisecond `O(1)` interval preview
> Safe View-Only lock prevents accidental overwrites

![screenshot of big data view](/article-assets/bigdata_preview.webp)

[Launch NanoCell CSV](https://nanocell-csv.com/)
