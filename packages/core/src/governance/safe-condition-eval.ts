/**
 * 安全的条件表达式解析器，替代 new Function() 避免代码注入风险。
 *
 * 支持语法：
 *   - 字面值比较: item.prop === 'value' / item.prop == "value"
 *   - 不等: item.prop !== 'value'
 *   - 逻辑运算: expr1 && expr2 / expr1 || expr2
 *   - 布尔字面值: true / false
 *   - 成员访问: item.prop.subProp (仅点号路径)
 */

type Item = Record<string, unknown>;

export function evalCondition(condition: string, item: Item): boolean {
  const trimmed = condition.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const tokens = tokenize(trimmed);
  const result = parseOr(tokens, { pos: 0 }, item);
  return Boolean(result);
}

// ─── Tokenizer ──────────────────────────────────────────────────

type Token =
  | { type: 'ident'; value: string }
  | { type: 'string'; value: string }
  | { type: 'op'; value: '===' | '!==' | '==' | '!=' }
  | { type: 'logical'; value: '&&' | '||' }
  | { type: 'eof' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // String literal
    if (input[i] === "'" || input[i] === '"') {
      const quote = input[i];
      i++;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        str += input[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Operators: === !== == !=
    if (input[i] === '=' && input[i + 1] === '=') {
      if (input[i + 2] === '=') {
        tokens.push({ type: 'op', value: '===' });
        i += 3;
      } else {
        tokens.push({ type: 'op', value: '==' });
        i += 2;
      }
      continue;
    }
    if (input[i] === '!' && input[i + 1] === '=') {
      if (input[i + 2] === '=') {
        tokens.push({ type: 'op', value: '!==' });
        i += 3;
      } else {
        tokens.push({ type: 'op', value: '!=' });
        i += 2;
      }
      continue;
    }

    // Logical operators
    if (input[i] === '&' && input[i + 1] === '&') {
      tokens.push({ type: 'logical', value: '&&' });
      i += 2;
      continue;
    }
    if (input[i] === '|' && input[i + 1] === '|') {
      tokens.push({ type: 'logical', value: '||' });
      i += 2;
      continue;
    }

    // Identifier (including 'item' and property names)
    if (/[a-zA-Z_$]/.test(input[i])) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_$]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }

    // Dot access
    if (input[i] === '.') {
      i++;
      continue; // dots are consumed as part of identifier chains
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

// ─── Parser ─────────────────────────────────────────────────────

function parseOr(tokens: Token[], ctx: { pos: number }, item: Item): boolean {
  let left = parseAnd(tokens, ctx, item);

  while (ctx.pos < tokens.length && tokens[ctx.pos].type === 'logical') {
    const tok = tokens[ctx.pos];
    if ((tok as { type: 'logical'; value: string }).value !== '||') break;
    ctx.pos++;
    const right = parseAnd(tokens, ctx, item);
    left = left || right;
  }

  return left;
}

function parseAnd(tokens: Token[], ctx: { pos: number }, item: Item): boolean {
  let left = parseComparison(tokens, ctx, item);

  while (ctx.pos < tokens.length && tokens[ctx.pos].type === 'logical') {
    const tok = tokens[ctx.pos];
    if ((tok as { type: 'logical'; value: string }).value !== '&&') break;
    ctx.pos++;
    const right = parseComparison(tokens, ctx, item);
    left = left && right;
  }

  return left;
}

function parseComparison(tokens: Token[], ctx: { pos: number }, item: Item): boolean {
  if (ctx.pos >= tokens.length) return false;

  // 'true' / 'false' literals
  if (tokens[ctx.pos].type === 'ident') {
    const ident = (tokens[ctx.pos] as { type: 'ident'; value: string }).value;
    if (ident === 'true') {
      ctx.pos++;
      return true;
    }
    if (ident === 'false') {
      ctx.pos++;
      return false;
    }
  }

  // item.prop... — read the full dotted path
  let path = '';
  while (ctx.pos < tokens.length && tokens[ctx.pos].type === 'ident') {
    const name = (tokens[ctx.pos] as { type: 'ident'; value: string }).value;
    if (path) {
      path += '.' + name;
    } else {
      path = name;
    }
    ctx.pos++;
  }

  // Check for comparison operator
  if (ctx.pos < tokens.length && tokens[ctx.pos].type === 'op') {
    const op = (tokens[ctx.pos] as { type: 'op'; value: string }).value;
    ctx.pos++;

    // Expect a string value
    if (ctx.pos >= tokens.length || tokens[ctx.pos].type !== 'string') {
      return false;
    }
    const strVal = (tokens[ctx.pos] as { type: 'string'; value: string }).value;
    ctx.pos++;

    const actual = resolvePath(path, item);
    switch (op) {
      case '===':
        return actual === strVal;
      case '==':
        return actual == strVal;
      case '!==':
        return actual !== strVal;
      case '!=':
        return actual != strVal;
      default:
        return false;
    }
  }

  return false;
}

function resolvePath(path: string, item: Item): unknown {
  const parts = path.split('.');
  // Skip leading 'item' if present
  if (parts[0] === 'item') parts.shift();
  let current: unknown = item;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
