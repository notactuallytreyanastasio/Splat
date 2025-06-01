defmodule Splat.Scene do
  use Scenic.Scene

  alias Scenic.Graph
  import Scenic.Primitives

  @canvas_width 800
  @canvas_height 600
  @tool_palette_width 60

  def init(scene, _param, _opts) do
    graph = create_canvas_graph()

    scene =
      scene
      |> assign(drawing: false)
      |> assign(draw_lines: [])
      |> assign(current_line: [])
      |> assign(selected_tool: :pencil)
      |> push_graph(graph)

    request_input(scene, [:cursor_button, :cursor_pos])

    {:ok, scene}
  end

  # Handle mouse button press (start drawing or tool selection)
  def handle_input({:cursor_button, {:btn_left, 1, [], {x, y}}}, _context, scene) do
    cond do
      # Check if click is in tool palette area
      x < @tool_palette_width ->
        handle_tool_selection(x, y, scene)
      
      # Click is in canvas area - start drawing
      x >= @tool_palette_width ->
        IO.puts("Started drawing at #{x}, #{y}")
        scene =
          scene
          |> assign(drawing: true)
          |> assign(current_line: [{x, y}])
        
        {:noreply, scene}
      
      true ->
        {:noreply, scene}
    end
  end

  defp handle_tool_selection(x, y, scene) do
    cond do
      # Pencil tool area (5-55 x, 10-60 y)
      x >= 5 and x <= 55 and y >= 10 and y <= 60 ->
        IO.puts("Pencil tool selected")
        graph = create_canvas_graph() 
                |> add_drawn_lines(scene.assigns.draw_lines)
                |> highlight_selected_tool(:pencil)
        
        scene =
          scene
          |> assign(selected_tool: :pencil)
          |> push_graph(graph)
        
        {:noreply, scene}
      
      # Eraser tool area (5-55 x, 70-120 y)
      x >= 5 and x <= 55 and y >= 70 and y <= 120 ->
        IO.puts("Eraser tool selected")
        graph = create_canvas_graph()
                |> add_drawn_lines(scene.assigns.draw_lines)
                |> highlight_selected_tool(:eraser)
        
        scene =
          scene
          |> assign(selected_tool: :eraser)
          |> push_graph(graph)
        
        {:noreply, scene}
      
      true ->
        {:noreply, scene}
    end
  end

  defp highlight_selected_tool(graph, selected_tool) do
    # For now, just return the graph as-is
    # The highlighting is handled in add_tool_palette based on the selected tool
    graph
  end

  # Handle mouse button release (stop drawing)
  def handle_input({:cursor_button, {:btn_left, 0, [], {x, y}}}, _context, scene) do
    if scene.assigns.drawing do
      IO.puts("Stopped drawing at #{x}, #{y}")
      
      # Add final point and save the completed line with tool info
      current_line = scene.assigns.current_line ++ [{x, y}]
      line_with_tool = {current_line, scene.assigns.selected_tool}
      draw_lines = scene.assigns.draw_lines ++ [line_with_tool]
      
      # Update graph with all drawn lines
      graph = create_canvas_graph() |> add_drawn_lines(draw_lines)
      
      scene =
        scene
        |> assign(drawing: false)
        |> assign(current_line: [])
        |> assign(draw_lines: draw_lines)
        |> push_graph(graph)
      
      {:noreply, scene}
    else
      {:noreply, scene}
    end
  end

  # Handle cursor movement (draw while dragging)
  def handle_input({:cursor_pos, {x, y}}, _context, scene) do
    if scene.assigns.drawing do
      # Add point to current line
      current_line = scene.assigns.current_line ++ [{x, y}]
      
      # Update graph with current drawing
      current_line_with_tool = {current_line, scene.assigns.selected_tool}
      all_lines = scene.assigns.draw_lines ++ [current_line_with_tool]
      graph = create_canvas_graph() |> add_drawn_lines(all_lines)
      
      scene =
        scene
        |> assign(current_line: current_line)
        |> push_graph(graph)
      
      {:noreply, scene}
    else
      {:noreply, scene}
    end
  end

  def handle_input(input, _context, scene) do
    IO.puts("Received input: #{inspect(input)}")
    {:noreply, scene}
  end

  defp create_canvas_graph() do
    Graph.build()
    |> add_tool_palette()
    |> add_canvas()
    |> highlight_selected_tool(:pencil)
  end

  defp add_tool_palette(graph) do
    # Tool palette background
    graph = rect(graph, {@tool_palette_width, @canvas_height}, 
                 fill: {220, 220, 220}, stroke: {1, :black}, translate: {0, 0})
    
    # Pencil tool (selected by default)
    graph = rect(graph, {50, 50}, 
                 fill: {180, 180, 255}, stroke: {2, :blue}, 
                 translate: {5, 10}, id: :pencil_tool)
    
    # Simple pencil icon using lines
    graph = line(graph, {{20, 25}, {35, 40}}, stroke: {2, :black})
    graph = line(graph, {{20, 25}, {25, 20}}, stroke: {2, :black})
    graph = line(graph, {{25, 20}, {30, 25}}, stroke: {2, :black})
    graph = line(graph, {{30, 25}, {35, 40}}, stroke: {2, :black})
    
    # Eraser tool
    graph = rect(graph, {50, 50}, 
                 fill: {240, 240, 240}, stroke: {1, :gray}, 
                 translate: {5, 70}, id: :eraser_tool)
    
    # Simple eraser icon
    rect(graph, {20, 15}, fill: {255, 192, 203}, stroke: {1, :black}, translate: {20, 82})
  end

  defp add_canvas(graph) do
    # Drawing canvas
    rect(graph, {@canvas_width - @tool_palette_width, @canvas_height}, 
         fill: :white, stroke: {1, :black}, translate: {@tool_palette_width, 0})
  end

  defp add_drawn_lines(graph, []), do: graph
  defp add_drawn_lines(graph, lines) do
    Enum.reduce(lines, graph, fn line_with_tool, acc_graph ->
      draw_line_from_points(acc_graph, line_with_tool)
    end)
  end

  defp draw_line_from_points(graph, []), do: graph
  defp draw_line_from_points(graph, [_single_point]), do: graph
  defp draw_line_from_points(graph, {points, tool}) when length(points) >= 2 do
    # Get color based on tool
    color = case tool do
      :pencil -> :black
      :eraser -> :white
      _ -> :black
    end
    
    # Draw lines connecting consecutive points
    points
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.reduce(graph, fn [{x1, y1}, {x2, y2}], acc_graph ->
      line(acc_graph, {{x1, y1}, {x2, y2}}, stroke: {3, color})
    end)
  end
  defp draw_line_from_points(graph, points) when is_list(points) and length(points) >= 2 do
    # Fallback for lines without tool info (legacy support)
    points
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.reduce(graph, fn [{x1, y1}, {x2, y2}], acc_graph ->
      line(acc_graph, {{x1, y1}, {x2, y2}}, stroke: {3, :black})
    end)
  end


end