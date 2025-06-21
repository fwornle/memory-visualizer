#!/usr/bin/env python3
"""
Enhanced HTTP server with CORS support and API endpoints for VKB memory visualizer.
This server handles both static files and API requests for team management.
"""

import http.server
import socketserver
import sys
import os
import json
import subprocess
from urllib.parse import unquote, parse_qs, urlparse


class APIHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with CORS support and API endpoints."""
    
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
    
    def do_GET(self):
        """Handle GET requests including API endpoints."""
        parsed = urlparse(self.path)
        
        if parsed.path == '/api/teams':
            self.handle_get_teams()
        elif parsed.path == '/api/current-teams':
            self.handle_get_current_teams()
        elif parsed.path == '/api/available-teams':
            self.handle_get_available_teams()
        else:
            # Serve static files
            super().do_GET()
    
    def do_POST(self):
        """Handle POST requests for API endpoints."""
        parsed = urlparse(self.path)
        
        if parsed.path == '/api/teams':
            self.handle_set_teams()
        else:
            self.send_error(404, "Not Found")
    
    def handle_get_current_teams(self):
        """Get currently selected teams from CODING_TEAM env var."""
        teams_env = os.environ.get('CODING_TEAM', 'coding')  # Default to coding
        
        # Parse teams similar to VKB server
        teams = teams_env.replace('{', '').replace('}', '').split(',')
        teams = [t.strip() for t in teams if t.strip()]
        
        if not teams:
            teams = ['coding']  # Default to coding team
        
        self.send_json_response({'teams': teams, 'raw': teams_env})
    
    def handle_get_available_teams(self):
        """Get list of available teams by scanning shared-memory-*.json files."""
        # Use CODING_KB_PATH if set, otherwise use the parent directory
        kb_path = os.environ.get('CODING_KB_PATH')
        if not kb_path:
            # Default to parent directory of this script (the coding repo)
            kb_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        available_teams = []
        
        # No more default - only scan for team-specific files
        try:
            for filename in os.listdir(kb_path):
                if filename.startswith('shared-memory-') and filename.endswith('.json') and not filename.endswith('-legacy-backup.json'):
                    team = filename.replace('shared-memory-', '').replace('.json', '')
                    available_teams.append(team)
        except OSError as e:
            print(f"Error reading KB path {kb_path}: {e}", file=sys.stderr)
            # Return at least coding team as fallback
            available_teams = ['coding']
        
        # Sort for consistent ordering, but put coding first
        available_teams.sort()
        if 'coding' in available_teams:
            available_teams.remove('coding')
            available_teams.insert(0, 'coding')
        
        # Get entity counts for each team
        team_info = []
        for team in available_teams:
            filepath = os.path.join(kb_path, f'shared-memory-{team}.json')
            
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    entity_count = len(data.get('entities', []))
                    display_name = data.get('displayName', team.title())
                    description = data.get('description', f'{display_name} knowledge base')
                    team_info.append({
                        'name': team,
                        'displayName': display_name,
                        'description': description,
                        'entities': entity_count,
                        'file': os.path.basename(filepath)
                    })
            except Exception as e:
                print(f"Error reading {filepath}: {e}", file=sys.stderr)
                team_info.append({
                    'name': team,
                    'displayName': team.title(),
                    'description': f'{team.title()} knowledge base',
                    'entities': 0,
                    'file': os.path.basename(filepath)
                })
        
        self.send_json_response({'available': team_info})
    
    def handle_set_teams(self):
        """Update CODING_TEAM env var and reload visualization."""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            teams = data.get('teams', [])
            
            if not teams:
                teams = ['coding']
            
            # Update environment variable
            teams_str = ','.join(teams)
            os.environ['CODING_TEAM'] = teams_str
            
            # Trigger data regeneration by deleting memory.json
            dist_path = os.path.join(os.path.dirname(__file__), 'dist', 'memory.json')
            if os.path.exists(dist_path):
                os.remove(dist_path)
            
            # Run data processor to regenerate with new teams
            coding_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            vkb_cli = os.path.join(coding_path, 'bin', 'vkb-cli.js')
            
            # Call vkb data processor
            result = subprocess.run(
                ['node', vkb_cli, 'data', 'process'],
                capture_output=True,
                text=True,
                env=os.environ
            )
            
            if result.returncode == 0:
                self.send_json_response({
                    'success': True,
                    'teams': teams,
                    'message': f'Switched to teams: {teams_str}'
                })
            else:
                self.send_json_response({
                    'success': False,
                    'error': result.stderr or 'Failed to process data'
                }, status_code=500)
                
        except Exception as e:
            self.send_json_response({
                'success': False,
                'error': str(e)
            }, status_code=500)
    
    def send_json_response(self, data, status_code=200):
        """Send a JSON response."""
        response = json.dumps(data)
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response.encode())
    
    def log_message(self, format, *args):
        """Override to provide cleaner log messages."""
        import datetime
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        sys.stderr.write(f"{timestamp} - {format % args}\n")


def main():
    """Start the enhanced HTTP server with API support."""
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    
    # Change to the specified directory
    if directory != '.':
        os.chdir(directory)
    
    # Create server with SO_REUSEADDR option
    try:
        class ReuseAddrTCPServer(socketserver.TCPServer):
            allow_reuse_address = True
        
        with ReuseAddrTCPServer(("", port), APIHTTPRequestHandler) as httpd:
            print(f"Serving HTTP with API on port {port} from directory '{os.getcwd()}'")
            print(f"Server URL: http://localhost:{port}")
            print("API endpoints:")
            print("  GET  /api/current-teams - Get current CODING_TEAM setting")
            print("  GET  /api/available-teams - List available team files")
            print("  POST /api/teams - Update team selection")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nServer stopped.")
    except OSError as e:
        if e.errno == 98:
            print(f"Error: Port {port} is already in use.")
            print("Please stop any existing server or use a different port.")
            print(f"Try: lsof -i :{port} to see what's using the port")
            sys.exit(1)
        else:
            raise


if __name__ == "__main__":
    main()