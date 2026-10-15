#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
installer="$repo_dir/scripts/dashboard-install.sh"
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/dashboard-test.XXXXXX")
trap 'rm -rf -- "$test_dir"' EXIT
unset MANAGEMENT_STATIC_PATH WRITABLE_PATH writable_path

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_equal() { cmp -s -- "$1" "$2" || fail "File contents differ: $1 and $2"; }
expect_failure() {
  if bash "$installer" "$@" >"$test_dir/error.log" 2>&1; then
    fail "The command must fail: $*"
  fi
}
install_fixture() { bash "$installer" --source "$test_dir/source.html" "$@" >/dev/null; }

printf '<html>dashboard one</html>\n' >"$test_dir/source.html"
printf '<html>dashboard two</html>\n' >"$test_dir/replacement.html"
mkdir -p "$test_dir/config space"
printf 'management:\n  secret-key: test-only\n' >"$test_dir/config space/config.yaml"
cp -- "$test_dir/config space/config.yaml" "$test_dir/config.original"

install_fixture --config "$test_dir/config space/config.yaml"
target="$test_dir/config space/static/management.html"
assert_equal "$test_dir/source.html" "$target"
assert_equal "$test_dir/config.original" "$test_dir/config space/config.yaml"
install_fixture --config "$test_dir/config space/config.yaml"

expect_failure --source "$test_dir/replacement.html" --output "$target"
assert_equal "$test_dir/source.html" "$target"
bash "$installer" --source "$test_dir/replacement.html" --output "$target" --force >/dev/null
assert_equal "$test_dir/replacement.html" "$target"

MANAGEMENT_STATIC_PATH="  $test_dir/environment static  " install_fixture --config "$test_dir/unused.yaml"
assert_equal "$test_dir/source.html" "$test_dir/environment static/management.html"
MANAGEMENT_STATIC_PATH="$test_dir/environment file/MANAGEMENT.HTML" install_fixture
assert_equal "$test_dir/source.html" "$test_dir/environment file/MANAGEMENT.HTML"
WRITABLE_PATH="$test_dir/writable" install_fixture
assert_equal "$test_dir/source.html" "$test_dir/writable/static/management.html"
writable_path="$test_dir/lowercase writable" install_fixture
assert_equal "$test_dir/source.html" "$test_dir/lowercase writable/static/management.html"
WRITABLE_PATH=" " writable_path="$test_dir/fallback writable" install_fixture
assert_equal "$test_dir/source.html" "$test_dir/fallback writable/static/management.html"
MANAGEMENT_STATIC_PATH="$test_dir/static priority" WRITABLE_PATH="$test_dir/ignored" install_fixture
assert_equal "$test_dir/source.html" "$test_dir/static priority/management.html"
[[ ! -e "$test_dir/ignored" ]] || fail "The static override must take priority"
MANAGEMENT_STATIC_PATH="$test_dir/ignored again" install_fixture --output "$test_dir/explicit/management.html"
assert_equal "$test_dir/source.html" "$test_dir/explicit/management.html"
[[ ! -e "$test_dir/ignored again" ]] || fail "The output option must take priority"
install_fixture --config "$test_dir/config space" --force

expect_failure --source "$test_dir/missing.html" --output "$test_dir/missing/management.html"
[[ ! -e "$test_dir/missing" ]] || fail "A missing source must leave the destination unchanged"
: >"$test_dir/empty.html"
expect_failure --source "$test_dir/empty.html" --output "$target" --force
assert_equal "$test_dir/source.html" "$target"
expect_failure --output
expect_failure --unknown
expect_failure --source "$test_dir/source.html" --output "$test_dir"

# Replacement must replace the link and preserve its original target.
ln -s "$test_dir/replacement.html" "$test_dir/link.html"
expect_failure --source "$test_dir/source.html" --output "$test_dir/link.html"
install_fixture --output "$test_dir/link.html" --force
[[ ! -L "$test_dir/link.html" ]] || fail "The replacement must be a regular file"
assert_equal "$test_dir/source.html" "$test_dir/link.html"
assert_equal "$test_dir/source.html" "$target"
assert_equal "$test_dir/config.original" "$test_dir/config space/config.yaml"
[[ -z "$(find "$test_dir" -name '.management.html.*' -print -quit)" ]] || fail "Temporary files remain"
mkdir -p "$test_dir/repository/scripts" "$test_dir/repository/dashboard/dist"
cp -- "$installer" "$test_dir/repository/scripts/dashboard-install.sh"
cp -- "$test_dir/source.html" "$test_dir/repository/dashboard/dist/index.html"
bash "$test_dir/repository/scripts/dashboard-install.sh" >/dev/null
assert_equal "$test_dir/source.html" "$test_dir/repository/static/management.html"
rm -- "$test_dir/repository/dashboard/dist/index.html"
cp -- "$test_dir/replacement.html" "$test_dir/repository/dashboard/dist/management.html"
bash "$test_dir/repository/scripts/dashboard-install.sh" --force >/dev/null
assert_equal "$test_dir/replacement.html" "$test_dir/repository/static/management.html"
printf 'PASS: dashboard deployment tests\n'
