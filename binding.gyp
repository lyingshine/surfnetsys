{
  "targets": [
    {
      "target_name": "keyboard_hook",
      "sources": ["keyboard_hook.cpp"],
      "include_dirs": [
        "<!(node -e \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -e \"require('node-addon-api').gyp\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 0,
          "AdditionalOptions": ["/std:c++17"]
        }
      }
    }
  ]
}