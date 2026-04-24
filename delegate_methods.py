import re

with open('packages/core/src/pipeline/runner.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Helper to replace method body
def replace_method_body(content, method_pattern, new_body):
    """Replace a method's body while keeping its signature."""
    # Find method signature start
    match = re.search(method_pattern, content)
    if not match:
        print(f"Pattern not found: {method_pattern[:50]}")
        return content
    
    start = match.start()
    # Find opening brace after signature
    brace_pos = content.find('{', start)
    if brace_pos == -1:
        print(f"Opening brace not found for: {method_pattern[:50]}")
        return content
    
    # Find matching closing brace
    depth = 1
    pos = brace_pos + 1
    while depth > 0 and pos < len(content):
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    
    end = pos
    
    old_method = content[start:end]
    new_method = content[start:brace_pos + 1] + '\n' + new_body + '\n  }'
    
    content = content[:start] + new_method + content[end:]
    return content

# 1. #warnIgnoredError
content = replace_method_body(
    content,
    r'  #warnIgnoredError\(context: string, error: unknown\): void \{',
    '    warnIgnoredError(context, error);'
)

# 2. #buildDraftPrompt
content = replace_method_body(
    content,
    r'  #buildDraftPrompt\(input: WriteDraftInput\): string \{',
    '    return buildDraftPrompt(input);'
)

# 3. #readChapterSummary
content = replace_method_body(
    content,
    r'  #readChapterSummary\(bookId: string, chapterNumber: number\): string \{',
    '    return readChapterSummary(bookId, chapterNumber, this.stateManager);'
)

# 4. #readChapterContent
content = replace_method_body(
    content,
    r'  #readChapterContent\(bookId: string, chapterNumber: number\): string \{',
    '    return readChapterContent(bookId, chapterNumber, this.stateManager);'
)

# 5. #loadStoredStateHash
content = replace_method_body(
    content,
    r'  #loadStoredStateHash\(stateDir: string\): string \| null \{',
    '    return loadStoredStateHash(stateDir);'
)

# 6. #checkWorldRules
content = replace_method_body(
    content,
    r'  async #checkWorldRules\(',
    '    return checkWorldRules(content, chapterNumber, rules, this.provider);'
)

# 7. #extractMemory
content = replace_method_body(
    content,
    r'  async #extractMemory\(',
    '    return extractMemory(content, bookId, chapterNumber, this.provider, this.stateStore, cachedManifest);'
)

# 8. #buildMemoryDelta
content = replace_method_body(
    content,
    r'  #buildMemoryDelta\(',
    '    return buildMemoryDelta(memoryResult, manifest, chapterNumber);'
)

# 9. #persistChapterAtomic
content = replace_method_body(
    content,
    r'  #persistChapterAtomic\(',
    '    persistChapterAtomic(content, bookId, chapterNumber, title, status, metadata, this.stateManager);'
)

# 10. #updateStateAfterChapter
content = replace_method_body(
    content,
    r'  #updateStateAfterChapter\(',
    '    updateStateAfterChapter(bookId, chapterNumber, title, content, this.stateManager, this.stateStore, manifestOverride);'
)

with open('packages/core/src/pipeline/runner.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Delegation replacements done')
