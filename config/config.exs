import Config

config :splat, :viewport,
  name: :main_viewport,
  size: {800, 600},
  default_scene: Splat.Scene,
  drivers: [
    [module: Scenic.Driver.Local, cursor: true]
  ]