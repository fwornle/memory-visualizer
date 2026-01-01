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
import signal
import subprocess
from urllib.parse import unquote, parse_qs, urlparse

# Ignore SIGHUP to prevent termination when parent terminal closes
# This allows the server to run as a proper daemon
# Windows doesn't have SIGHUP, so we check for its existence
if hasattr(signal, 'SIGHUP'):
    signal.signal(signal.SIGHUP, signal.SIG_IGN)


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

        # Team management endpoints (existing)
        if parsed.path == '/api/teams' or parsed.path == '/api/available-teams':
            self.handle_get_available_teams()
        elif parsed.path == '/api/current-teams':
            self.handle_get_current_teams()
        elif parsed.path == '/api/config':
            self.handle_get_config()
        elif parsed.path == '/health':
            self.handle_health_check()
        # Database query endpoints (new)
        elif parsed.path == '/api/health':
            self.handle_database_query('health', parsed.query)
        elif parsed.path == '/api/entities':
            self.handle_database_query('entities', parsed.query)
        elif parsed.path == '/api/relations':
            self.handle_database_query('relations', parsed.query)
        elif parsed.path == '/api/stats':
            self.handle_database_query('stats', parsed.query)
        # Serve knowledge-management files from coding root
        elif parsed.path.startswith('/knowledge-management/'):
            self.handle_knowledge_management_file(parsed.path)
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
        """Get currently selected teams from KNOWLEDGE_VIEW env var."""
        teams_env = os.environ.get('KNOWLEDGE_VIEW', 'coding')  # Default to coding only

        # Parse teams similar to VKB server
        teams = teams_env.replace('{', '').replace('}', '').split(',')
        teams = [t.strip() for t in teams if t.strip()]

        if not teams:
            teams = ['coding']  # Default to coding only

        self.send_json_response({'teams': teams, 'raw': teams_env})

    def handle_get_config(self):
        """Get server configuration including data source mode."""
        # Phase 4: Default to 'online' mode (GraphDB direct queries)
        # 'batch' mode is only for manually viewing exported JSON files
        data_source = os.environ.get('VKB_DATA_SOURCE', 'online')
        knowledge_view = os.environ.get('KNOWLEDGE_VIEW', 'coding')

        self.send_json_response({
            'dataSource': data_source,
            'knowledgeView': knowledge_view
        })

    def handle_get_available_teams(self):
        """Get list of available teams by querying GraphDB directly."""
        # Navigate from memory-visualizer to coding root
        coding_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        query_script = os.path.join(coding_path, 'lib', 'vkb-server', 'db-query-cli.js')

        if not os.path.exists(query_script):
            self.send_json_response({
                'error': 'Database query backend not available',
                'message': f'db-query-cli.js not found at {query_script}'
            }, status_code=503)
            return

        try:
            # Prepare environment with correct export directory
            query_env = os.environ.copy()
            query_env['KNOWLEDGE_EXPORT_DIR'] = os.path.join(coding_path, '.data', 'knowledge-export')

            # Query GraphDB for all teams
            result = subprocess.run(
                ['node', query_script, 'teams', '{}'],
                capture_output=True,
                text=True,
                timeout=10,
                cwd=coding_path,
                env=query_env
            )

            if result.returncode == 0:
                # Parse JSON response - filter out debug/status lines
                try:
                    # Find the JSON line (ignore logging/status lines)
                    lines = result.stdout.strip().split('\n')
                    json_line = None
                    for line in lines:
                        # Skip lines that start with special chars (✓, ⚠, [) or are empty
                        if line and not line[0] in ['✓', '⚠', '[', ' ']:
                            json_line = line
                            break

                    if not json_line:
                        raise ValueError("No JSON found in output")

                    teams_data = json.loads(json_line)

                    # Transform to expected format
                    team_info = []
                    for team in teams_data.get('available', []):
                        team_info.append({
                            'name': team['name'],
                            'displayName': team.get('displayName', team['name'].title()),
                            'description': f"{team.get('displayName', team['name'].title())} knowledge from GraphDB",
                            'entities': team.get('entityCount', 0),
                            'lastActivity': team.get('lastActivity')
                        })

                    self.send_json_response({'available': team_info})
                except (json.JSONDecodeError, ValueError) as e:
                    print(f"Failed to parse teams response: {e}", file=sys.stderr)
                    print(f"Output was: {result.stdout}", file=sys.stderr)
                    self.send_json_response({
                        'error': 'Invalid JSON response from database backend',
                        'output': result.stdout
                    }, status_code=500)
            else:
                error_msg = result.stderr.strip() if result.stderr else 'Unknown error'
                print(f"GraphDB teams query failed: {error_msg}", file=sys.stderr)
                self.send_json_response({
                    'error': 'Failed to query teams from GraphDB',
                    'message': error_msg
                }, status_code=500)
        except subprocess.TimeoutExpired:
            self.send_json_response({
                'error': 'Teams query timed out',
                'message': 'GraphDB query took longer than 10 seconds'
            }, status_code=504)
        except Exception as e:
            self.send_json_response({
                'error': 'Internal server error',
                'message': str(e)
            }, status_code=500)
    
    def handle_set_teams(self):
        """Update KNOWLEDGE_VIEW env var and reload visualization."""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        try:
            data = json.loads(post_data)
            teams = data.get('teams', [])

            if not teams:
                teams = ['coding']

            # Update environment variable
            teams_str = ','.join(teams)
            os.environ['KNOWLEDGE_VIEW'] = teams_str

            # Trigger data regeneration by deleting memory.json
            dist_path = os.path.join(os.path.dirname(__file__), 'dist', 'memory.json')
            if os.path.exists(dist_path):
                os.remove(dist_path)

            # Run data processor to regenerate with new teams
            # Navigate from memory-visualizer to coding root
            coding_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            vkb_cli = os.path.join(coding_path, 'bin', 'vkb-cli.js')
            
            # Verify VKB CLI exists
            if not os.path.exists(vkb_cli):
                self.send_json_response({
                    'success': False,
                    'error': f'VKB CLI not found at {vkb_cli}'
                }, status_code=500)
                return
            
            # Prepare environment with updated KNOWLEDGE_VIEW
            process_env = os.environ.copy()
            process_env['KNOWLEDGE_VIEW'] = teams_str
            print(f"Setting KNOWLEDGE_VIEW to: {teams_str}", file=sys.stderr)
            
            try:
                # Call vkb data processor with timeout and better error handling
                result = subprocess.run(
                    ['node', vkb_cli, 'data', 'process'],
                    capture_output=True,
                    text=True,
                    env=process_env,
                    timeout=30,  # 30 second timeout
                    cwd=coding_path
                )
                
                if result.returncode == 0:
                    self.send_json_response({
                        'success': True,
                        'teams': teams,
                        'message': f'Switched to teams: {teams_str}'
                    })
                else:
                    error_msg = result.stderr.strip() if result.stderr else 'Unknown error'
                    print(f"VKB CLI error (code {result.returncode}): {error_msg}", file=sys.stderr)
                    print(f"VKB CLI stdout: {result.stdout}", file=sys.stderr)
                    self.send_json_response({
                        'success': False,
                        'error': f'Data processing failed: {error_msg}'
                    }, status_code=500)
            except subprocess.TimeoutExpired:
                self.send_json_response({
                    'success': False,
                    'error': 'Data processing timed out after 30 seconds'
                }, status_code=500)
            except Exception as subprocess_error:
                self.send_json_response({
                    'success': False,
                    'error': f'Subprocess error: {str(subprocess_error)}'
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
    
    def handle_database_query(self, query_type, query_params):
        """Proxy database queries to Node.js backend."""
        # Navigate from memory-visualizer to coding root
        coding_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        query_script = os.path.join(coding_path, 'lib', 'vkb-server', 'db-query-cli.js')

        if not os.path.exists(query_script):
            self.send_json_response({
                'error': 'Database query backend not available',
                'message': f'db-query-cli.js not found at {query_script}'
            }, status_code=503)
            return

        try:
            # Parse query parameters
            params = parse_qs(query_params) if query_params else {}

            # Convert to JSON for CLI
            params_json = {k: v[0] if len(v) == 1 else v for k, v in params.items()}

            # Prepare environment with correct export directory
            query_env = os.environ.copy()
            query_env['KNOWLEDGE_EXPORT_DIR'] = os.path.join(coding_path, '.data', 'knowledge-export')

            # Call Node.js CLI with query type and params
            result = subprocess.run(
                ['node', query_script, query_type, json.dumps(params_json)],
                capture_output=True,
                text=True,
                timeout=10,  # 10 second timeout
                cwd=coding_path,
                env=query_env
            )

            if result.returncode == 0:
                # Parse and return JSON response
                # Filter out debug/status lines (✓, ⚠, [, whitespace)
                try:
                    # Find the JSON line (ignore logging/status lines)
                    lines = result.stdout.strip().split('\n')
                    json_line = None
                    for line in lines:
                        # Skip lines that start with special chars (✓, ⚠, [) or are empty
                        if line and not line[0] in ['✓', '⚠', '[', ' ']:
                            json_line = line
                            break

                    if json_line:
                        response_data = json.loads(json_line)
                        self.send_json_response(response_data)
                    else:
                        raise json.JSONDecodeError("No JSON found", result.stdout, 0)
                except json.JSONDecodeError as e:
                    self.send_json_response({
                        'error': 'Invalid JSON response from database backend',
                        'output': result.stdout,
                        'parseError': str(e)
                    }, status_code=500)
            else:
                error_msg = result.stderr.strip() if result.stderr else 'Unknown error'
                self.send_json_response({
                    'error': 'Database query failed',
                    'message': error_msg
                }, status_code=500)
        except subprocess.TimeoutExpired:
            self.send_json_response({
                'error': 'Database query timed out',
                'message': 'Query took longer than 10 seconds'
            }, status_code=504)
        except Exception as e:
            self.send_json_response({
                'error': 'Internal server error',
                'message': str(e)
            }, status_code=500)

    def handle_knowledge_management_file(self, path):
        """Serve files from the knowledge-management directory in coding root."""
        # Navigate from memory-visualizer to coding root
        coding_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        # Remove leading slash and construct full path
        relative_path = path.lstrip('/')
        full_path = os.path.join(coding_path, relative_path)

        # Security: Ensure the path stays within coding directory
        full_path = os.path.realpath(full_path)
        if not full_path.startswith(os.path.realpath(coding_path)):
            self.send_error(403, "Forbidden: Path traversal detected")
            return

        # Check if file exists
        if not os.path.isfile(full_path):
            self.send_error(404, f"File not found: {path}")
            return

        # Determine content type
        content_type = 'text/plain'
        if full_path.endswith('.md'):
            content_type = 'text/markdown; charset=utf-8'
        elif full_path.endswith('.png'):
            content_type = 'image/png'
        elif full_path.endswith('.jpg') or full_path.endswith('.jpeg'):
            content_type = 'image/jpeg'
        elif full_path.endswith('.svg'):
            content_type = 'image/svg+xml'
        elif full_path.endswith('.json'):
            content_type = 'application/json'
        elif full_path.endswith('.puml'):
            content_type = 'text/plain; charset=utf-8'

        try:
            # Read and serve the file
            mode = 'rb' if content_type.startswith('image/') else 'r'
            with open(full_path, mode) as f:
                content = f.read()

            if isinstance(content, str):
                content = content.encode('utf-8')

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {str(e)}")

    def handle_health_check(self):
        """Handle health check endpoint for monitoring."""
        import time
        
        # Try to import psutil, but don't fail if it's not available
        try:
            import psutil
            psutil_available = True
        except ImportError:
            psutil_available = False
        
        # Get basic system info
        health_info = {
            'status': 'healthy',
            'timestamp': time.time(),
            'server': {
                'port': int(os.environ.get('PORT', 8080)),
                'pid': os.getpid(),
                'uptime': time.time() - getattr(self.server, 'start_time', time.time())
            },
            'system': {
                'cpu_percent': psutil.cpu_percent() if psutil_available else 0,
                'memory_percent': psutil.virtual_memory().percent if psutil_available else 0
            }
        }
        
        # Check knowledge base files
        kb_path = os.environ.get('CODING_KB_PATH')
        if not kb_path:
            kb_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        kb_files = []
        knowledge_export_path = os.path.join(kb_path, '.data', 'knowledge-export')
        try:
            for filename in os.listdir(knowledge_export_path):
                if filename.endswith('.json'):
                    filepath = os.path.join(knowledge_export_path, filename)
                    if os.path.exists(filepath):
                        kb_files.append({
                            'name': filename,
                            'size': os.path.getsize(filepath),
                            'last_modified': os.path.getmtime(filepath)
                        })
        except Exception as e:
            health_info['warning'] = f'Could not check knowledge base files: {str(e)}'
        
        health_info['knowledge_base'] = {
            'path': kb_path,
            'files': kb_files
        }
        
        self.send_json_response(health_info)
    
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
            print("  GET  /api/config - Get server configuration (dataSource, knowledgeView)")
            print("  GET  /api/current-teams - Get current KNOWLEDGE_VIEW setting")
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