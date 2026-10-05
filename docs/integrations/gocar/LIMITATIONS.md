# Gocar.be: limitations

- Only works if the dealer has an export.
- An uploaded file is a snapshot, not a schedule: nothing refreshes it until the dealer uploads again. An upload-only source is skipped by the hourly sync and does not count for the freshness of the stock.
- Uploads are limited to 2 MB. A file that drops more than half of the platform's active cars (even for a small stock) sells nothing until the dealer confirms.
- Cross-platform matching works on VIN, AutoScout number and listing URL when the export carries them.
