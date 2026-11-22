#!/bin/sh
set -eu
# Published assets are read by nginx workers, independently of the deploy user's umask.
umask 022

release_dir=${CANVAS_WEB_RELEASE_DIR:-/opt/canvas-release}
html_dir=${CANVAS_WEB_HTML_DIR:-/usr/share/nginx/html}
release_dir=${release_dir%/}
html_dir=${html_dir%/}
retention_days=${CANVAS_WEB_ASSET_RETENTION_DAYS:-7}
case "$retention_days" in ''|*[!0-9]*|0) echo 'Invalid asset retention days' >&2; exit 1;; esac
test -s "$release_dir/index.html"

if test -n "${CANVAS_WEB_ROLLOUT_SLOT:-}"; then
    slot=$CANVAS_WEB_ROLLOUT_SLOT
    previous=${CANVAS_WEB_ROLLOUT_PREVIOUS:-legacy}
    revision=${CANVAS_WEB_ROLLOUT_REVISION:?missing rollout revision}
    case "$slot" in blue|green) ;; *) echo 'Invalid web rollout slot' >&2; exit 1;; esac
    case "$previous" in legacy|blue|green) ;; *) echo 'Invalid previous web rollout slot' >&2; exit 1;; esac
    test "$slot" != "$previous"
    shared_dir=$html_dir
    slot_parent="$shared_dir/.canvas-slots"
    html_dir="$slot_parent/$slot"
    seed_dir=$shared_dir
    if test "$previous" != legacy; then seed_dir="$slot_parent/$previous"; fi
    if ! test -f "$html_dir/.canvas-slot-revision" || ! grep -Fxq "$revision" "$html_dir/.canvas-slot-revision"; then
        test -s "$seed_dir/index.html"
        mkdir -p "$slot_parent"
        seed=$(mktemp -d "$slot_parent/.seed.XXXXXX")
        trap 'rm -rf "$seed"' EXIT
        for item in "$seed_dir/"*; do
            test -e "$item" || continue
            test "${item##*/}" != skill-media || continue
            cp -al "$item" "$seed/"
        done
        for manifest in .canvas-assets-current .canvas-assets-previous; do
            if test -f "$seed_dir/$manifest"; then cp "$seed_dir/$manifest" "$seed/$manifest"; fi
        done
        printf '%s\n' "$revision" > "$seed/.canvas-slot-revision"
        chmod 755 "$slot_parent" "$seed"
        if test -e "$html_dir"; then
            test -f "$html_dir/.canvas-slot-revision"
            rm -rf "$html_dir"
        fi
        mv "$seed" "$html_dir"
        trap - EXIT
    fi
    sed -i "s@^    root /usr/share/nginx/html;\$@    root /usr/share/nginx/html/.canvas-slots/$slot;@" /etc/nginx/conf.d/default.conf
    grep -Fxq "    root /usr/share/nginx/html/.canvas-slots/$slot;" /etc/nginx/conf.d/default.conf
fi

mkdir -p "$html_dir"
# One writer per volume; do not serve a partial publication after a copy error.
lock="$html_dir/.canvas-publish-lock"
mkdir "$lock" || { echo 'Another publication is active; inspect the publication lock' >&2; exit 1; }
stage=''
cleanup() { test -z "$stage" || rm -rf "$stage"; rmdir "$lock"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
stage=$(mktemp -d "$html_dir/.canvas-stage.XXXXXX")
test -d "$release_dir/assets"
(cd "$release_dir" && find assets -type f | LC_ALL=C sort) > "$stage/.canvas-assets"
cp "$release_dir/index.html" "$stage/index.html"
# Finish changed-file copies before publication, without duplicating unchanged media.
find "$release_dir" -type f ! -path "$release_dir/index.html" | while IFS= read -r file; do
    relative=${file#"$release_dir/"}
    if test -f "$html_dir/$relative" && cmp -s "$file" "$html_dir/$relative"; then
        continue
    fi
    mkdir -p "$stage/$(dirname "$relative")"
    cp "$file" "$stage/$relative"
done

# Repair existing public directories too: a prior deployment may have created
# them with mode 0700 even when their file contents already match this release.
find "$release_dir" -type d | while IFS= read -r directory; do
    relative=${directory#"$release_dir"}
    mkdir -p "$html_dir$relative"
    chmod 755 "$html_dir$relative"
done

# Publish complete files by rename on the same filesystem. HTML is switched last.
find "$stage" -type f ! -path "$stage/index.html" ! -path "$stage/.canvas-assets" | while IFS= read -r file; do
    relative=${file#"$stage/"}
    mkdir -p "$html_dir/$(dirname "$relative")"
    if test -f "$html_dir/$relative" && cmp -s "$file" "$html_dir/$relative"; then
        touch "$html_dir/$relative"
    else
        mv -f "$file" "$html_dir/$relative"
        touch "$html_dir/$relative"
    fi
done
# Refresh the last-use age of unchanged chunks without staging their contents.
find "$release_dir" -type f ! -path "$release_dir/index.html" | while IFS= read -r file; do
    relative=${file#"$release_dir/"}
    chmod 644 "$html_dir/$relative"
    touch "$html_dir/$relative"
done
if test -f "$html_dir/.canvas-assets-current" && ! cmp -s "$stage/.canvas-assets" "$html_dir/.canvas-assets-current"; then
    cp "$html_dir/.canvas-assets-current" "$html_dir/.canvas-assets-previous"
fi
mv -f "$stage/index.html" "$html_dir/index.html"
chmod 644 "$html_dir/index.html"
mv -f "$stage/.canvas-assets" "$html_dir/.canvas-assets-current"

# Retain current + previous builds unconditionally, and older chunks for 7 days.
# Only prune hashed assets, never application data or non-asset public files.
find "$html_dir/assets" -type f -mtime +"$retention_days" | while IFS= read -r file; do
    relative=${file#"$html_dir/"}
    if grep -Fxq "$relative" "$html_dir/.canvas-assets-current" || { test -f "$html_dir/.canvas-assets-previous" && grep -Fxq "$relative" "$html_dir/.canvas-assets-previous"; }; then
        continue
    fi
    rm -f "$file"
done
cleanup
trap - EXIT HUP INT TERM

exec nginx -g 'daemon off;'
