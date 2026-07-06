#!/bin/sh

# This .xsession configs contains required setup for the actual frame itself.
# We use Raspbian OS which comes with a default DM. We need to disable some
# UI elements in order to get full screen. Ideally, we'd use a more barebones
# OS, but this is simple enough regardless.

# Stop screen from going to sleep.
xset -dpms
xset s off
xset s noblank

# Disable titlebar and other UI elements.
matchbox-window-manager -use_titlebar no &
unclutter &

# Run slideshow using feh, restarting it (to pick up new images) whenever
# it's killed instead of tearing down the whole X session.
while true; do
  feh -F -Y -N --on-last-slide resume --randomize --slideshow-delay 60 -Z $HOME/slideshow
done
