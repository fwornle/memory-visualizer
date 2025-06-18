#!/usr/bin/env python3
"""
Simple HTTP server with CORS support for the VKB memory visualizer.
This server allows cross-origin requests needed for the knowledge base viewer.
"""

import http.server
import socketserver
import sys
import os
from urllib.parse import unquote


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with CORS support."""
    
    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        """Handle preflight OPTIONS requests."""
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        """Override to provide cleaner log messages."""
        # Add timestamp to log messages
        import datetime
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        sys.stderr.write(f"{timestamp} - {format % args}\n")


def main():
    """Start the CORS-enabled HTTP server."""
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    
    # Change to the specified directory
    if directory != '.':
        os.chdir(directory)
    
    # Create server with SO_REUSEADDR option
    try:
        with socketserver.TCPServer(("", port), CORSHTTPRequestHandler) as httpd:
            # Allow reusing the address
            httpd.allow_reuse_address = True
            print(f"Serving HTTP on port {port} from directory '{os.getcwd()}'")
            print(f"Server URL: http://localhost:{port}")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nServer stopped.")
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"Error: Port {port} is already in use.")
            print("Please stop any existing server or use a different port.")
            print(f"Try: lsof -i :{port} to see what's using the port")
            sys.exit(1)
        else:
            raise


if __name__ == "__main__":
    main()