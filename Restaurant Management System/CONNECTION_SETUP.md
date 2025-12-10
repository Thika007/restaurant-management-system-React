# API Connection Configuration

## Overview
The application can be configured to connect to different API servers by editing the `connection.txt` file in the `dist` folder.

## How to Change API URL

1. Navigate to the `dist` folder in your deployment
2. Open `connection.txt` in a text editor
3. Replace the URL with your server's address (e.g., `http://DESKTOP-N9315KJ:5000/api`)
4. Save the file
5. Refresh your browser

## Default Configuration
- Default URL: `http://localhost:5000/api`
- The application will automatically load the URL from `connection.txt` on startup
- If `connection.txt` is missing or invalid, it will fall back to the default URL

## Example
If your server is running on a different PC with hostname `DESKTOP-N9315KJ`, edit `connection.txt` to:
```
http://DESKTOP-N9315KJ:5000/api
```

## Notes
- No rebuild is required - just edit the text file
- The change takes effect after refreshing the browser
- Make sure the server is accessible from the client PC

