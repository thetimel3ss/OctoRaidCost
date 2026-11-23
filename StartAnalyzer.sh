#!/bin/sh
url='https://thetimel3ss.github.io/OctoRaidCost/'
if command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "$url"
fi
printf '%s\n' "Open $url in your browser."
