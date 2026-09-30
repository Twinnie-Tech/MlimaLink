import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { RichTextEditor } from '../src/app/shared/dashboard/product-form/rich-text-editor';

// ProseMirror measures text ranges; jsdom has no layout, so give it empty boxes.
beforeAll(() => {
  const box = () => new DOMRect(0, 0, 0, 0);
  Range.prototype.getBoundingClientRect = box;
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
});

function renderEditor(value = '<p>Hello world</p>') {
  const onChange = vi.fn();
  const view = render(
    <RichTextEditor
      id="description"
      label="Description"
      value={value}
      onChange={onChange}
      placeholder="Describe the product"
      footer="2 words"
    />,
  );
  return { onChange, ...view };
}

/** TipTap keeps its editor on the editable element. */
async function editorFor(id = 'description') {
  const element = await waitFor(() => {
    const found = document.getElementById(id);
    if (!found) throw new Error('Editor not mounted yet');
    return found as HTMLElement & { editor: Editor };
  });
  return element.editor;
}

const lastHtml = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[0] as string;

describe('RichTextEditor', () => {
  it('offers fonts, sizes, styles and formatting tools', async () => {
    renderEditor();
    await editorFor();

    const toolbar = screen.getByRole('toolbar', {
      name: 'Description formatting',
    });
    expect(toolbar).toBeTruthy();
    expect(
      Array.from(
        (screen.getByLabelText('Font') as HTMLSelectElement).options,
      ).map((option) => option.textContent),
    ).toEqual([
      'Sans Serif',
      'Serif',
      'Monospace',
      'Arial',
      'Verdana',
      'Trebuchet',
      'Times',
    ]);
    expect(
      Array.from(
        (screen.getByLabelText('Text size') as HTMLSelectElement).options,
      ).map((option) => option.textContent),
    ).toEqual(['Small', 'Normal', 'Large', 'Larger', 'Huge']);
    for (const tool of [
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Text colour',
      'Highlight',
      'Numbered list',
      'Bulleted list',
      'Align centre',
      'Quote',
      'Link',
      'Undo',
      'Clear formatting',
    ]) {
      expect(screen.getByRole('button', { name: tool })).toBeTruthy();
    }
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeTruthy();
    expect(screen.getByText('Hello world')).toBeTruthy();
    expect(screen.getByText('2 words')).toBeTruthy();
  });

  it('styles the selected text and reports the HTML', async () => {
    const { onChange } = renderEditor();
    const editor = await editorFor();
    act(() => {
      editor.commands.selectAll();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(lastHtml(onChange)).toBe('<p><strong>Hello world</strong></p>');
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.change(screen.getByLabelText('Font'), {
      target: { value: 'Georgia, serif' },
    });
    fireEvent.change(screen.getByLabelText('Text size'), {
      target: { value: '20px' },
    });
    expect(lastHtml(onChange)).toContain('font-family: Georgia, serif');
    expect(lastHtml(onChange)).toContain('font-size: 20px');

    fireEvent.click(screen.getByRole('button', { name: 'Text colour' }));
    fireEvent.click(screen.getByRole('button', { name: '#dc2626' }));
    expect(lastHtml(onChange)).toContain('color: rgb(220, 38, 38)');
    fireEvent.click(screen.getByRole('button', { name: 'Text colour' }));
    expect((screen.getByLabelText('Custom') as HTMLInputElement).value).toBe(
      '#dc2626',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Text colour' }));

    fireEvent.change(screen.getByLabelText('Paragraph style'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Align centre' }));
    expect(lastHtml(onChange)).toMatch(/^<h2 style="text-align: center;?">/);

    fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }));
    expect(lastHtml(onChange)).toBe('<p>Hello world</p>');
  });

  it('makes lists and follows outside changes such as clearing the form', async () => {
    const { onChange, rerender } = renderEditor();
    const editor = await editorFor();
    act(() => {
      editor.commands.selectAll();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
    expect(lastHtml(onChange)).toBe('<ul><li><p>Hello world</p></li></ul>');

    rerender(
      <RichTextEditor
        id="description"
        label="Description"
        value=""
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(editor.isEmpty).toBe(true));
  });
});
