# TWYK

This repository contains code powering various projects around my home.

## Picture Frame
This project is, as the title suggests, a digital picture frame. I've hookedup a monitor and had my friend make a custom wood frame around. The frame is powered by a Raspberry Pi Zero running headless Debian.

### Design
The following use cases are supported:

1. When user is connected to local Wifi, they can login into a mobile app and into our local NAS server. There is a dedicated directory of photos reserved
   for the picture frame. Photos can be added and removed there. After the directory is modified, the changes are synced to the Pi Zero.

Given the limitations of the SoC, and need for certain pre-processing, I've simplified the logic on the Pi and instead offload any meaningfully complex work to a local Linux box that is always running. This thing does the following:

1. Installs a directory watcher on the NAS to observe changes. Allowing it to be triggered when a file has been updated.
2. Convert HEIC (iPhone) images into JPEG.
3. Update the directory on Pi Zero to have updated images.
4. Trigger system reboot to reset frame. (Currently, we don't change the images at runtime.)

This design is inefficient but suffices for my family's use case.
