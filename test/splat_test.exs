defmodule SplatTest do
  use ExUnit.Case
  doctest Splat

  test "greets the world" do
    assert Splat.hello() == :world
  end
end
