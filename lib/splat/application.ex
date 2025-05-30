defmodule Splat.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    main_viewport_config = Application.get_env(:splat, :viewport)

    children = [
      {Scenic, [main_viewport_config]}
    ]

    opts = [strategy: :one_for_one, name: Splat.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
