#!/usr/bin/bash

# Startup Xserver if on display
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]]; then
  startx
fi
