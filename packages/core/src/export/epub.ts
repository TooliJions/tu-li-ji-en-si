import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';

// ─── Types ──────────────────────────────────────────────────────

export interface EpubChapter {
  number: number;
  title: string;
  content: string;
}

export interface EpubInput {
  title: string;
  author: string;
  language: string;
  chapters: EpubChapter[];
}

// ─── Helpers ────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function padNumber(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function buildMimetype(): string {
  return 'application/epub+zip';
}

function buildContainerXml(rootFile: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${rootFile}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function buildContentOpf(input: EpubInput, bookId: string): string {
  const { title, author, language, chapters } = input;
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const manifestItems = chapters
    .map((ch) => {
      const id = `chapter-${padNumber(ch.number, 3)}`;
      return `    <item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`;
    })
    .join('\n');

  const spineItems = chapters
    .map((ch) => {
      const id = `chapter-${padNumber(ch.number, 3)}`;
      return `    <itemref idref="${id}"/>`;
    })
    .join('\n');

  const tocNavId =
    chapters.length > 0
      ? `\n    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
      : '';
  const tocRef = chapters.length > 0 ? `\n    <itemref idref="nav"/>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
    <meta property="dcterms:modified">${date}</meta>
  </metadata>
  <manifest>
${manifestItems}${tocNavId}
  </manifest>
  <spine>
${spineItems}${tocRef}
  </spine>
</package>`;
}

function buildChapterXhtml(chapter: EpubChapter): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(chapter.title)}</title>
</head>
<body>
  <h1>${escapeXml(chapter.title)}</h1>
  ${chapter.content}
</body>
</html>`;
}

function buildNavXhtml(input: EpubInput): string {
  const { title, chapters } = input;
  const navItems = chapters
    .map((ch) => {
      const href = `chapter-${padNumber(ch.number, 3)}.xhtml`;
      return `      <li><a href="${href}">${escapeXml(ch.title)}</a></li>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
}

// ─── EpubExporter ───────────────────────────────────────────────

/**
 * EPUB 3.0 exporter — generates a valid EPUB file from book data.
 * Output can be opened in any EPUB reader.
 */
export class EpubExporter {
  /**
   * Generate an EPUB file as a Buffer.
   */
  async generate(input: EpubInput): Promise<Buffer> {
    const zip = new AdmZip();
    const bookId = randomUUID().toLowerCase();
    const oebpsPath = 'OEBPS';

    // mimetype must be first and uncompressed
    zip.addFile('mimetype', Buffer.from(buildMimetype()), '', 0);

    // META-INF/container.xml
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from(buildContainerXml(`${oebpsPath}/content.opf`))
    );

    // OEBPS/content.opf
    zip.addFile(`${oebpsPath}/content.opf`, Buffer.from(buildContentOpf(input, bookId)));

    // OEBPS/nav.xhtml (navigation document, EPUB 3 requirement)
    if (input.chapters.length > 0) {
      zip.addFile(`${oebpsPath}/nav.xhtml`, Buffer.from(buildNavXhtml(input)));
    }

    // Chapter files
    for (const ch of input.chapters) {
      const filename = `${oebpsPath}/chapter-${padNumber(ch.number, 3)}.xhtml`;
      zip.addFile(filename, Buffer.from(buildChapterXhtml(ch)));
    }

    return zip.toBuffer();
  }
}
