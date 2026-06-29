#!/bin/bash

if [[ -z "${TWYK_USER}" || -z "${TWYK_HOST}" || -z "${TWYK_MEMORIES}" ]]; then
    echo "Error: TWYK_USER, TWYK_HOST, and TWYK_MEMORIES environment variables are not set."
    exit 1
fi

usage() {
    echo "Usage: $0 {sleep|wake|sync|update|debug}"
    exit 1
}

function invoke() {
  local command=$1

  ssh "$TWYK_USER@$TWYK_HOST" "$command"
}

# Check if subcommand is provided
if [ $# -eq 0 ]; then
    usage
fi

# Handle subcommands using a case statement
case $1 in
    "sleep")
        invoke "xset -d :0 dpms force off"
        ;;
    "wake")
        invoke "xset -d :0 dpms force on"
        invoke "sudo reboot"
        ;;
    "sync")
        source="$TWYK_MEMORIES"
        staging="$HOME/tmp/twyk"
        dest="$TWYK_USER@$TWYK_HOST:/home/pi/.local/share/com.yaneury.twyk"
        rsync -avz --exclude='.DS_Store' $source $staging
        cd $staging
        for file in *; do
          if [ -f "$file" ]; then
            lowercase=$(echo "$file" | tr '[:upper:]' '[:lower:]')
            mv -i "$file" "$lowercase"
          fi
        done
        heif-convert *.heic -f jpg
        rsync -avz --exclude='*.heic' $staging $dest
        ;;
    "update")
        # version=$(git describe --tags --abbrev=0 | sed 's/^v//')
        version="0.0.6"
        echo $version
        target="$(pwd)/src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/twyk_${version}_arm64.deb"
        PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu/ cargo tauri build --target aarch64-unknown-linux-gnu --bundles deb && \
        scp $target $TWYK_USER@$TWYK_HOST:/home/pi/downloads/twyk.deb && \
        invoke "sudo dpkg -i /home/pi/downloads/twyk.deb" && \
        invoke "rm /home/pi/downloads/twyk.deb" && \
        invoke "sudo reboot"
        ;;
    "debug")
        version=$(git describe --tags --abbrev=0 | sed 's/^v//')
        target="$(pwd)/src-tauri/target/aarch64-unknown-linux-gnu/debug/bundle/deb/twyk_${version}_arm64.deb"
        PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu/ cargo tauri build --target aarch64-unknown-linux-gnu --bundles deb --debug && \
        scp $target $TWYK_USER@$TWYK_HOST:/home/pi/downloads/twyk.deb && \
        invoke "sudo dpkg -i /home/pi/downloads/twyk.deb" && \
        invoke "rm /home/pi/downloads/twyk.deb" && \
        invoke "sudo reboot"
        ;;
    *)
        echo "Invalid subcommand"
        usage
        ;;
esac

exit 0
