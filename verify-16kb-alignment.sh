#!/bin/bash

# Verify 16KB page size alignment for Android AAB/APK files
# Uses llvm-objdump (Google's recommended method) and zipalign
# Usage: ./verify-16kb-alignment.sh <path-to-aab-or-apk>
#
# NOTE: Google Play only enforces 16KB alignment for 64-bit architectures
# (arm64-v8a, x86_64). 32-bit architectures (armeabi-v7a, x86) are NOT checked.

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-aab-or-apk>"
    exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: File not found: $INPUT_FILE"
    exit 1
fi

# Check ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    echo "Error: ANDROID_HOME not set"
    exit 1
fi

# Find NDK
NDK_VER=$(ls "$ANDROID_HOME/ndk/" 2>/dev/null | head -1)
if [ -z "$NDK_VER" ]; then
    echo "Error: No NDK found in $ANDROID_HOME/ndk/"
    exit 1
fi

LLVM_OBJDUMP="$ANDROID_HOME/ndk/$NDK_VER/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-objdump"
if [ ! -x "$LLVM_OBJDUMP" ]; then
    # Try macOS path
    LLVM_OBJDUMP="$ANDROID_HOME/ndk/$NDK_VER/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-objdump"
fi

if [ ! -x "$LLVM_OBJDUMP" ]; then
    echo "Error: llvm-objdump not found"
    exit 1
fi

# Find zipalign
ZIPALIGN=$(find "$ANDROID_HOME/build-tools" -name "zipalign" | sort -V | tail -1)
if [ -z "$ZIPALIGN" ]; then
    echo "Warning: zipalign not found, skipping ZIP alignment check"
fi

# Create temp directory
TEMP_DIR=$(mktemp -d /tmp/aab-verify-XXXXXX)
echo "=========================================="
echo "16KB Alignment Verification"
echo "=========================================="
echo ""
echo "File: $INPUT_FILE"
echo "NDK: $NDK_VER"
echo "Temp: $TEMP_DIR"
echo ""
echo "NOTE: Google Play only checks 64-bit ABIs (arm64-v8a, x86_64)"
echo "      32-bit failures are shown for info only."
echo ""

# Extract the file
echo "Extracting..."
unzip -q "$INPUT_FILE" -d "$TEMP_DIR"

# Find the lib directory
LIB_DIR=""
if [ -d "$TEMP_DIR/base/lib" ]; then
    LIB_DIR="$TEMP_DIR/base/lib"
elif [ -d "$TEMP_DIR/lib" ]; then
    LIB_DIR="$TEMP_DIR/lib"
else
    echo "Error: No lib directory found"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo ""
echo "=========================================="
echo "ELF Segment Alignment Check (llvm-objdump)"
echo "=========================================="
echo ""

TOTAL_64=0
PASS_64=0
FAIL_64=0
TOTAL_32=0
PASS_32=0
FAIL_32=0
FAILED_LIBS_64=""
FAILED_LIBS_32=""

while IFS= read -r so; do
    REL_PATH="${so#$TEMP_DIR/}"

    # Determine if 64-bit or 32-bit
    IS_64BIT=false
    if [[ "$REL_PATH" == *"arm64-v8a"* ]] || [[ "$REL_PATH" == *"x86_64"* ]]; then
        IS_64BIT=true
        TOTAL_64=$((TOTAL_64 + 1))
    else
        TOTAL_32=$((TOTAL_32 + 1))
    fi

    # Get LOAD segment alignments using llvm-objdump
    LOAD_OUTPUT=$("$LLVM_OBJDUMP" -p "$so" 2>/dev/null | grep LOAD || true)

    # Check for 2**12 (4KB) alignment - this is BAD
    # 2**14 (16KB) or higher is GOOD
    HAS_BAD_ALIGN=false

    while IFS= read -r line; do
        if [ -n "$line" ]; then
            # Extract alignment value (last field, format: 2**N)
            ALIGN=$(echo "$line" | grep -oE '2\*\*[0-9]+' | tail -1)
            ALIGN_BITS=$(echo "$ALIGN" | sed 's/2\*\*//')

            if [ -n "$ALIGN_BITS" ] && [ "$ALIGN_BITS" -lt 14 ]; then
                HAS_BAD_ALIGN=true
                break
            fi
        fi
    done <<< "$LOAD_OUTPUT"

    if [ "$HAS_BAD_ALIGN" = true ]; then
        if [ "$IS_64BIT" = true ]; then
            echo "❌ $REL_PATH"
            echo "   $LOAD_OUTPUT" | head -2
            FAIL_64=$((FAIL_64 + 1))
            FAILED_LIBS_64="$FAILED_LIBS_64$REL_PATH\n"
        else
            echo "⚠️  $REL_PATH (32-bit, not checked by Google Play)"
            FAIL_32=$((FAIL_32 + 1))
            FAILED_LIBS_32="$FAILED_LIBS_32$REL_PATH\n"
        fi
    else
        echo "✅ $REL_PATH"
        if [ "$IS_64BIT" = true ]; then
            PASS_64=$((PASS_64 + 1))
        else
            PASS_32=$((PASS_32 + 1))
        fi
    fi
done < <(find "$LIB_DIR" -name "*.so" -type f | sort)

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "64-bit (Google Play enforced):"
echo "  Total: $TOTAL_64 | ✅ Passed: $PASS_64 | ❌ Failed: $FAIL_64"
echo ""
echo "32-bit (informational only):"
echo "  Total: $TOTAL_32 | ✅ Passed: $PASS_32 | ⚠️  Failed: $FAIL_32"

# ZIP alignment check
if [ -n "$ZIPALIGN" ]; then
    echo ""
    echo "=========================================="
    echo "ZIP Alignment Check (zipalign -P 16)"
    echo "=========================================="
    echo ""

    ZIP_RESULT=$("$ZIPALIGN" -c -P 16 -v "$INPUT_FILE" 2>&1 || true)
    # Only check 64-bit ZIP alignment
    ZIP_FAILURES=$(echo "$ZIP_RESULT" | grep -E "lib/(arm64-v8a|x86_64)/.*\.so.*\(BAD\)" || true)

    if [ -n "$ZIP_FAILURES" ]; then
        echo "❌ ZIP alignment failures (64-bit):"
        echo "$ZIP_FAILURES"
        FAIL_64=$((FAIL_64 + 1))
    else
        echo "✅ ZIP alignment OK (64-bit)"
    fi
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "=========================================="
if [ $FAIL_64 -eq 0 ]; then
    echo "✅ ALL 64-BIT CHECKS PASSED - Ready for Google Play"
    if [ $FAIL_32 -gt 0 ]; then
        echo ""
        echo "Note: $FAIL_32 32-bit libraries have alignment issues but these"
        echo "are NOT enforced by Google Play and won't cause rejection."
    fi
    exit 0
else
    echo "❌ 64-BIT ALIGNMENT ISSUES DETECTED"
    echo ""
    if [ -n "$FAILED_LIBS_64" ]; then
        echo "Failed 64-bit libraries:"
        echo -e "$FAILED_LIBS_64" | grep -v '^$' | sed 's/^/  /'
    fi
    echo ""
    echo "This build will be REJECTED by Google Play."
    exit 1
fi
