defmodule Splat.Scene do
  use Scenic.Scene

  alias Scenic.Graph
  import Scenic.Primitives

  @canvas_width 800
  @canvas_height 600

  def init(scene, _param, _opts) do
    # Seed random number generator for unique art each run
    :rand.seed(:exsplus, {
      :erlang.phash2(make_ref()),
      :erlang.monotonic_time(),
      :erlang.unique_integer()
    })

    graph = create_artwork_graph()

    {:ok,
     scene
     |> assign(artwork: :generated)
     |> push_graph(graph)
    }
  end

  def handle_input({:cursor_button, {:btn_left, 0, [], {x, y}}}, _context, scene) do
    # Check if click is within the button area (button is at top right)
    button_center_x = @canvas_width - 30 - 20  # button_x + button_width/2
    button_center_y = 20 + 30                  # button_y + button_height/2
    
    # Check if click is within button radius
    distance = :math.sqrt(:math.pow(x - button_center_x, 2) + :math.pow(y - button_center_y, 2))
    
    if distance <= 25 do  # radius of our button
      IO.puts("Redraw button clicked! Generating new artwork...")
      
      # Create new artwork
      graph = create_artwork_graph()
      
      scene =
        scene
        |> assign(artwork: :regenerated)
        |> push_graph(graph)
      
      {:noreply, scene}
    else
      IO.puts("Clicked outside button at #{x}, #{y}")
      {:noreply, scene}
    end
  end

  def handle_input(input, _context, scene) do
    IO.puts("Received input: #{inspect(input)}")
    {:noreply, scene}
  end

  defp create_artwork_graph() do
    Graph.build()
    |> rect({@canvas_width, @canvas_height}, fill: :white, stroke: {1, :black})
    |> generate_artwork()
    |> add_redraw_button()
  end

  defp add_redraw_button(graph) do
    button_width = 60
    button_height = 60
    button_x = @canvas_width - button_width - 20
    button_y = 20
    
    # Create a circular button
    center_x = button_x + button_width / 2
    center_y = button_y + button_height / 2
    radius = 25
    
    graph
    |> circle(radius, 
              fill: {70, 130, 180}, 
              stroke: {3, :black},
              translate: {center_x, center_y},
              input: [:cursor_button],
              id: :redraw_button)
    # Add a simple refresh symbol using lines
    |> line({{center_x - 10, center_y - 5}, {center_x + 10, center_y - 5}}, stroke: {3, :white})
    |> line({{center_x + 5, center_y - 10}, {center_x + 10, center_y - 5}}, stroke: {3, :white})
    |> line({{center_x + 5, center_y}, {center_x + 10, center_y - 5}}, stroke: {3, :white})
  end

  defp generate_artwork(graph) do
    # Generate 5-8 random bezier curves
    num_curves = Enum.random(5..8)
    
    Enum.reduce(1..num_curves, graph, fn _i, acc_graph ->
      acc_graph
      |> draw_random_bezier_with_triangles()
    end)
  end

  defp draw_random_bezier_with_triangles(graph) do
    # Generate random bezier curve points
    start_x = Enum.random(50..(@canvas_width - 50))
    start_y = Enum.random(100..(@canvas_height - 100))
    
    end_x = Enum.random(50..(@canvas_width - 50))
    end_y = Enum.random(100..(@canvas_height - 100))
    
    # Control points for the bezier curve
    cp1_x = start_x + Enum.random(-200..200)
    cp1_y = start_y + Enum.random(-150..150)
    
    cp2_x = end_x + Enum.random(-200..200)
    cp2_y = end_y + Enum.random(-150..150)
    
    # Random color for this curve and its triangles
    color = random_color()
    stroke_width = Enum.random(2..4)
    
    # Draw the bezier curve
    bezier_path = [
      {:move_to, start_x, start_y},
      {:bezier_to, cp1_x, cp1_y, cp2_x, cp2_y, end_x, end_y}
    ]
    
    graph = path(graph, bezier_path, stroke: {stroke_width, color})
    
    # Add triangles along the curve
    num_triangles = Enum.random(3..7)
    
    Enum.reduce(1..num_triangles, graph, fn i, acc_graph ->
      # Calculate position along the curve (0.0 to 1.0)
      t = i / (num_triangles + 1)
      
      # Calculate point on bezier curve using the bezier formula
      {x, y} = bezier_point(
        {start_x, start_y},
        {cp1_x, cp1_y}, 
        {cp2_x, cp2_y},
        {end_x, end_y},
        t
      )
      
      # Draw triangle at this point
      triangle_size = Enum.random(15..30)
      draw_triangle_at_point(acc_graph, x, y, triangle_size, color)
    end)
  end

  defp bezier_point({x0, y0}, {x1, y1}, {x2, y2}, {x3, y3}, t) do
    # Cubic bezier curve formula
    one_minus_t = 1.0 - t
    one_minus_t_squared = one_minus_t * one_minus_t
    one_minus_t_cubed = one_minus_t_squared * one_minus_t
    t_squared = t * t
    t_cubed = t_squared * t
    
    x = one_minus_t_cubed * x0 + 
        3 * one_minus_t_squared * t * x1 + 
        3 * one_minus_t * t_squared * x2 + 
        t_cubed * x3
        
    y = one_minus_t_cubed * y0 + 
        3 * one_minus_t_squared * t * y1 + 
        3 * one_minus_t * t_squared * y2 + 
        t_cubed * y3
        
    {x, y}
  end

  defp draw_triangle_at_point(graph, center_x, center_y, size, color) do
    # Calculate triangle vertices around the center point
    half_size = size / 2
    height = size * 0.866  # sqrt(3)/2 for equilateral triangle
    
    # Random rotation for visual interest
    rotation = Enum.random(0..360) * :math.pi() / 180
    
    # Triangle points (before rotation)
    points = [
      {0, -height * 2/3},           # Top
      {-half_size, height * 1/3},   # Bottom left  
      {half_size, height * 1/3}     # Bottom right
    ]
    
    # Rotate and translate points
    rotated_points = Enum.map(points, fn {x, y} ->
      rotated_x = x * :math.cos(rotation) - y * :math.sin(rotation)
      rotated_y = x * :math.sin(rotation) + y * :math.cos(rotation)
      {center_x + rotated_x, center_y + rotated_y}
    end)
    
    # Draw the triangle using three lines (like our Sierpinski triangles)
    [{x1, y1}, {x2, y2}, {x3, y3}] = rotated_points
    
    graph
    |> line({{x1, y1}, {x2, y2}}, stroke: {2, color})
    |> line({{x2, y2}, {x3, y3}}, stroke: {2, color})
    |> line({{x3, y3}, {x1, y1}}, stroke: {2, color})
  end

  defp random_color() do
    colors = [
      :red, :blue, :green, :purple, :orange, :pink, :cyan, :magenta,
      {200, 100, 50}, {50, 150, 200}, {150, 50, 150}, {100, 200, 100},
      {255, 140, 0}, {70, 130, 180}, {147, 112, 219}, {60, 179, 113}
    ]
    Enum.random(colors)
  end

  defp darken_color(:red), do: {139, 0, 0}
  defp darken_color(:blue), do: {0, 0, 139}
  defp darken_color(:green), do: {0, 100, 0}
  defp darken_color(:purple), do: {75, 0, 130}
  defp darken_color(:orange), do: {255, 69, 0}
  defp darken_color(:pink), do: {199, 21, 133}
  defp darken_color(:cyan), do: {0, 139, 139}
  defp darken_color(:magenta), do: {139, 0, 139}
  defp darken_color({r, g, b}), do: {div(r * 7, 10), div(g * 7, 10), div(b * 7, 10)}
end