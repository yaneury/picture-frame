#!/usr/bin/bash

# Startup Xserver if on display, restarting it whenever it exits so a
# remote `pkill Xorg` forces a full xsession restart.
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]]; then
  while true; do
    startx
  done
fi
