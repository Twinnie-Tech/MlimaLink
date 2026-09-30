'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Placeholder } from '@tiptap/extensions';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import styles from './rich-text-editor.module.css';

/** Web-safe families, so the shop shows the same font the seller picked. */
export const FONT_FAMILIES = [
  { label: 'Sans Serif', value: '' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
  { label: 'Times', value: '"Times New Roman", serif' },
];

export const FONT_SIZES = [
  { label: 'Small', value: '14px' },
  { label: 'Normal', value: '' },
  { label: 'Large', value: '20px' },
  { label: 'Larger', value: '24px' },
  { label: 'Huge', value: '32px' },
];

const BLOCKS = [
  { label: 'Normal', value: 'p' },
  { label: 'Heading 1', value: '2' },
  { label: 'Heading 2', value: '3' },
  { label: 'Heading 3', value: '4' },
] as const;

/** Mid tones stay readable on the shop's light and dark themes. */
const TEXT_COLOURS = [
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#6b7280',
];
const HIGHLIGHTS = [
  '#fef08a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#fed7aa',
  '#e9d5ff',
];

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align centre', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
] as const;

/** The description's HTML: empty when there's no text, and without the blank line kept after a final list. */
const htmlOf = (editor: Editor) =>
  editor.isEmpty ? '' : editor.getHTML().replace(/(<p><\/p>)+$/, '');

/** Browsers report colours as rgb(); the colour input only takes #rrggbb. */
function toHex(colour?: string) {
  const rgb = colour?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return colour;
  return `#${rgb
    .slice(1, 4)
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;
}

function ToolButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the text selection while the toolbar is used.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-blue-500/15 text-blue-700'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-white/5'
      }`}
    >
      <Icon size={16} />
    </button>
  );
}

function ToolSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs text-neutral-800 outline-none focus:border-blue-500"
    >
      {options.map((option) => (
        <option key={option.label} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A toolbar button that opens a row of colour swatches, a custom picker and a reset. */
function ColourMenu({
  label,
  icon,
  current,
  colours,
  onPick,
  onClear,
}: {
  label: string;
  icon: LucideIcon;
  current?: string;
  colours: string[];
  onPick: (colour: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={menu} className="relative">
      <div className="relative">
        <ToolButton
          label={label}
          icon={icon}
          active={open}
          onClick={() => setOpen((value) => !value)}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 bottom-1 left-1.5 h-0.5 rounded"
          style={{ background: current ?? 'transparent' }}
        />
      </div>
      {open && (
        <div
          role="group"
          aria-label={`${label} choices`}
          className="absolute top-9 left-0 z-20 w-48 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div className="grid grid-cols-6 gap-1.5">
            {colours.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-label={colour}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(colour);
                  setOpen(false);
                }}
                className="h-6 w-6 rounded-full border border-black/10 dark:border-white/20"
                style={{ background: colour }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-200 pt-2 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5 text-neutral-700">
              <input
                type="color"
                value={current ?? '#2563eb'}
                onChange={(event) => onPick(event.target.value)}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              Custom
            </label>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const Divider = () => (
  <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />
);

export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid = false,
  describedById,
  footer,
}: {
  id: string;
  label: string;
  /** HTML; empty string when there's no text. */
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  describedById?: string;
  footer?: ReactNode;
}) {
  // useEditor applies changed options (like these) on each render without rebuilding the editor.
  const editor = useEditor({
    // Rendered in the browser only, so server and client HTML match.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['mailto', 'tel'],
        },
      }),
      TextStyleKit.configure({ lineHeight: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        'aria-invalid': String(invalid),
        ...(describedById && { 'aria-describedby': describedById }),
        class: styles.content,
      },
    },
    onUpdate: ({ editor: current }) => onChange(htmlOf(current)),
    onBlur: () => onBlur?.(),
  });

  // Follows outside changes, e.g. the form being cleared.
  useEffect(() => {
    if (editor && value !== htmlOf(editor)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const textStyle = current.getAttributes('textStyle');
      const heading = BLOCKS.find(
        (block) =>
          block.value !== 'p' &&
          current.isActive('heading', { level: Number(block.value) }),
      );
      return {
        fontFamily: (textStyle.fontFamily as string | undefined) ?? '',
        fontSize: (textStyle.fontSize as string | undefined) ?? '',
        colour: toHex(textStyle.color as string | undefined),
        highlight: toHex(
          current.getAttributes('highlight').color as string | undefined,
        ),
        block: heading?.value ?? 'p',
        align:
          ALIGNMENTS.find((option) =>
            current.isActive({ textAlign: option.value }),
          )?.value ?? 'left',
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        subscript: current.isActive('subscript'),
        superscript: current.isActive('superscript'),
        orderedList: current.isActive('orderedList'),
        bulletList: current.isActive('bulletList'),
        blockquote: current.isActive('blockquote'),
        codeBlock: current.isActive('codeBlock'),
        link: current.isActive('link'),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const chain = () => editor?.chain().focus();

  const editLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address', previous ?? 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') {
      chain()?.extendMarkRange('link').unsetLink().run();
      return;
    }
    chain()?.extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-neutral-50 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 ${
        invalid ? 'border-rose-500/70' : 'border-neutral-200'
      }`}
    >
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="flex flex-wrap items-center gap-1 border-b border-neutral-200 p-2"
      >
        <ToolSelect
          label="Font"
          value={state?.fontFamily ?? ''}
          options={FONT_FAMILIES}
          onChange={(font) =>
            font
              ? chain()?.setFontFamily(font).run()
              : chain()?.unsetFontFamily().run()
          }
        />
        <ToolSelect
          label="Text size"
          value={state?.fontSize ?? ''}
          options={FONT_SIZES}
          onChange={(size) =>
            size
              ? chain()?.setFontSize(size).run()
              : chain()?.unsetFontSize().run()
          }
        />
        <ToolSelect
          label="Paragraph style"
          value={state?.block ?? 'p'}
          options={BLOCKS}
          onChange={(block) =>
            block === 'p'
              ? chain()?.setParagraph().run()
              : chain()
                  ?.setHeading({ level: Number(block) as 2 | 3 | 4 })
                  .run()
          }
        />
        <Divider />
        <ToolButton
          label="Bold"
          icon={Bold}
          active={state?.bold}
          onClick={() => chain()?.toggleBold().run()}
        />
        <ToolButton
          label="Italic"
          icon={Italic}
          active={state?.italic}
          onClick={() => chain()?.toggleItalic().run()}
        />
        <ToolButton
          label="Underline"
          icon={Underline}
          active={state?.underline}
          onClick={() => chain()?.toggleUnderline().run()}
        />
        <ToolButton
          label="Strikethrough"
          icon={Strikethrough}
          active={state?.strike}
          onClick={() => chain()?.toggleStrike().run()}
        />
        <Divider />
        <ColourMenu
          label="Text colour"
          icon={Baseline}
          current={state?.colour}
          colours={TEXT_COLOURS}
          onPick={(colour) => chain()?.setColor(colour).run()}
          onClear={() => chain()?.unsetColor().run()}
        />
        <ColourMenu
          label="Highlight"
          icon={Highlighter}
          current={state?.highlight}
          colours={HIGHLIGHTS}
          onPick={(color) => chain()?.setHighlight({ color }).run()}
          onClear={() => chain()?.unsetHighlight().run()}
        />
        <ToolButton
          label="Subscript"
          icon={SubscriptIcon}
          active={state?.subscript}
          onClick={() => chain()?.toggleSubscript().run()}
        />
        <ToolButton
          label="Superscript"
          icon={SuperscriptIcon}
          active={state?.superscript}
          onClick={() => chain()?.toggleSuperscript().run()}
        />
        <Divider />
        <ToolButton
          label="Numbered list"
          icon={ListOrdered}
          active={state?.orderedList}
          onClick={() => chain()?.toggleOrderedList().run()}
        />
        <ToolButton
          label="Bulleted list"
          icon={List}
          active={state?.bulletList}
          onClick={() => chain()?.toggleBulletList().run()}
        />
        {ALIGNMENTS.map((option) => (
          <ToolButton
            key={option.value}
            label={option.label}
            icon={option.icon}
            active={state?.align === option.value}
            onClick={() => chain()?.setTextAlign(option.value).run()}
          />
        ))}
        <Divider />
        <ToolButton
          label="Quote"
          icon={Quote}
          active={state?.blockquote}
          onClick={() => chain()?.toggleBlockquote().run()}
        />
        <ToolButton
          label="Code block"
          icon={SquareCode}
          active={state?.codeBlock}
          onClick={() => chain()?.toggleCodeBlock().run()}
        />
        <ToolButton
          label="Link"
          icon={Link2}
          active={state?.link}
          onClick={editLink}
        />
        <ToolButton
          label="Divider line"
          icon={Minus}
          onClick={() => chain()?.setHorizontalRule().run()}
        />
        <Divider />
        <ToolButton
          label="Undo"
          icon={Undo2}
          disabled={!state?.canUndo}
          onClick={() => chain()?.undo().run()}
        />
        <ToolButton
          label="Redo"
          icon={Redo2}
          disabled={!state?.canRedo}
          onClick={() => chain()?.redo().run()}
        />
        <ToolButton
          label="Clear formatting"
          icon={RemoveFormatting}
          onClick={() =>
            chain()?.unsetAllMarks().clearNodes().unsetTextAlign().run()
          }
        />
      </div>
      <EditorContent editor={editor} />
      {footer && (
        <div className="flex justify-end border-t border-neutral-200 px-3 py-1.5 text-xs text-neutral-500">
          {footer}
        </div>
      )}
    </div>
  );
}
