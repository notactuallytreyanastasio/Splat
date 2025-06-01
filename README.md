# Splat

Splat is a generative art program built with Scenic and Elixir. Each time you run it, it creates a unique piece of art featuring flowing bezier curves with colorful triangles.

## Quick Start

### Running the Application

```bash
mix deps.get
mix run --no-halt
```

A window will appear displaying generative artwork. Click the blue circular button in the top-right corner to generate new artwork.

### Using the MCP Server

The included MCP (Model Context Protocol) server allows external control of the Splat application:

```bash
cd mcp-server
npm install
npm start
```

Available MCP tools:
- `start_splat` - Launch the Splat application
- `stop_splat` - Stop the running application  
- `check_splat_status` - Check if application is running
- `generate_new_artwork` - Get instructions for generating new artwork
- `get_splat_info` - Get detailed application information

## Features

- [x] Generative bezier curve art with mathematical precision
- [x] Random triangles along curves with rotation and scaling
- [x] Unique artwork every run with proper random seeding
- [x] Interactive redraw button for new artwork generation
- [x] Cross-platform with Scenic framework
- [x] MCP server for external control and integration

## Technical Details

### Architecture
- **Framework**: Scenic (Elixir graphics framework)
- **Graphics Driver**: scenic_driver_local (OpenGL backend)
- **Canvas Size**: 800x600 pixels
- **Input Handling**: Mouse click detection for interactive button

### Art Generation
- **Curves**: 5-8 cubic bezier curves per artwork
- **Mathematics**: Parametric bezier curve calculation with proper control points
- **Triangles**: 3-7 triangles placed along each curve with random rotation
- **Colors**: Mix of named colors (:red, :blue, etc.) and RGB tuples
- **Randomization**: Proper seeding for unique artwork on each generation

### Interactive Controls
- **Redraw Button**: Blue circular button (25px radius) in top-right corner
- **Click Detection**: Distance-based collision detection for button interaction
- **Visual Feedback**: Console logging for successful button interactions

## Development

### Building a Release

For production deployment:

```bash
MIX_ENV=prod mix deps.get
MIX_ENV=prod mix compile  
MIX_ENV=prod mix release
```

The release will be created at `_build/prod/rel/splat/bin/splat`.

### Project Structure

```
splat/
├── lib/splat/
│   ├── application.ex    # OTP application setup
│   └── scene.ex         # Main scene with artwork generation
├── config/
│   └── config.exs       # Scenic viewport configuration
├── mcp-server/          # MCP server for external control
│   ├── src/index.js     # MCP server implementation
│   └── package.json     # Node.js dependencies
├── mix.exs             # Elixir project configuration
└── README.md           # This file
```

### Key Functions

- `create_artwork_graph/0` - Builds the complete scene graph
- `generate_artwork/1` - Creates multiple random bezier curves
- `draw_random_bezier_with_triangles/1` - Draws a single curve with triangles
- `bezier_point/5` - Calculates points along a cubic bezier curve
- `draw_triangle_at_point/5` - Renders rotated triangles at curve positions
- `handle_input/3` - Processes mouse clicks for button interaction

## Installation

### Prerequisites
- Elixir 1.18+ with OTP 27+
- Node.js 18+ (for MCP server)
- OpenGL-capable graphics driver

### macOS Installation
```bash
# Install Elixir via Homebrew
brew install elixir

# Clone and setup
git clone <repository>
cd splat
mix deps.get

# For MCP server
cd mcp-server
npm install
```

### Running
```bash
# Development mode
mix run --no-halt

# With MCP server
cd mcp-server && npm start
```

The application window will display colorful bezier curves with triangles. Each run generates completely unique artwork using mathematical randomization.
