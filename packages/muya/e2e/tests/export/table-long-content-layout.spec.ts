import { expect, test } from '../fixtures/muya';

const LONG_TOKEN = 'x'.repeat(480);
const LONG_URL = `https://example.com/${'long-path-segment-'.repeat(32)}`;
const MARKDOWN = `| ${LONG_TOKEN} | short header |
| --- | --- |
| short body | ${LONG_URL} |
`;

interface TableMetrics {
    availableWidth: number;
    tableWidth: number;
    longHeaderLines: number;
    longBodyLines: number;
    shortHeaderLines: number;
    shortBodyLines: number;
    minimumWidthEm?: number;
}

function expectWrappedWithoutOverflow(metrics: TableMetrics): void {
    expect(metrics.tableWidth).toBeLessThanOrEqual(metrics.availableWidth + 1);
    expect(metrics.longHeaderLines).toBeGreaterThan(1);
    expect(metrics.longBodyLines).toBeGreaterThan(1);
    expect(metrics.shortHeaderLines).toBe(1);
    expect(metrics.shortBodyLines).toBe(1);
}

test.describe('long table content layout (#5605)', () => {
    test('wraps long tokens and URLs in the editor and generated export HTML', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 720 });
        await page.evaluate(md => window.muya!.setContent(md), MARKDOWN);

        const editorMetrics = await page.evaluate(() => {
            const container = document.querySelector<HTMLElement>('.editor-container')!;
            const table = document.querySelector<HTMLElement>('table.mu-table-inner')!;
            const cells = Array.from(table.querySelectorAll<HTMLElement>('.mu-table-cell-content'));
            const lineCount = (cell: HTMLElement): number => {
                const range = document.createRange();
                range.selectNodeContents(cell);
                return new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size;
            };
            const style = getComputedStyle(cells[0]!);
            return {
                availableWidth: container.clientWidth,
                tableWidth: table.getBoundingClientRect().width,
                longHeaderLines: lineCount(cells[0]!),
                shortHeaderLines: lineCount(cells[1]!),
                shortBodyLines: lineCount(cells[2]!),
                longBodyLines: lineCount(cells[3]!),
                minimumWidthEm: Number.parseFloat(style.minWidth) / Number.parseFloat(style.fontSize),
            };
        });
        expectWrappedWithoutOverflow(editorMetrics);
        expect(editorMetrics.minimumWidthEm).toBeCloseTo(10, 1);

        const exportedHtml = await page.evaluate(async md => {
            const exporter = new window.MarkdownToHtml!(md);
            return exporter.generate();
        }, MARKDOWN);

        const exportMetrics = await page.evaluate(async (html) => {
            const iframe = document.createElement('iframe');
            iframe.style.width = '700px';
            iframe.style.height = '600px';
            const loaded = new Promise<void>((resolve, reject) => {
                iframe.addEventListener('load', () => resolve(), { once: true });
                iframe.addEventListener('error', () => reject(new Error('export iframe failed to load')), {
                    once: true,
                });
            });
            iframe.srcdoc = html;
            document.body.appendChild(iframe);
            await loaded;
            try {
                const exportedDocument = iframe.contentDocument!;
                const article = exportedDocument.querySelector<HTMLElement>('.markdown-body')!;
                const table = exportedDocument.querySelector<HTMLElement>('.markdown-body table')!;
                const cells = Array.from(table.querySelectorAll<HTMLElement>('th, td'));
                const lineCount = (cell: HTMLElement): number => {
                    const range = exportedDocument.createRange();
                    range.selectNodeContents(cell);
                    return new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size;
                };
                return {
                    availableWidth: article.clientWidth,
                    tableWidth: table.getBoundingClientRect().width,
                    longHeaderLines: lineCount(cells[0]!),
                    shortHeaderLines: lineCount(cells[1]!),
                    shortBodyLines: lineCount(cells[2]!),
                    longBodyLines: lineCount(cells[3]!),
                };
            }
            finally {
                iframe.remove();
            }
        }, exportedHtml);
        expectWrappedWithoutOverflow(exportMetrics);
    });
});
