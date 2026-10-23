// Mochiboard's doc editor: TipTap (ProseMirror) plus the few Word basics it doesn't ship with.
// Bundled into web/vendor/editor.js as the global `MBEditor`, so docs work offline.
import { Editor, Extension, generateHTML, generateJSON, getHTMLFromFragment } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

// font size, carried on the text style mark like color and font family (Word's size box)
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions: () => ({ types: ['textStyle'] }),
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: {
      default: null,
      parseHTML: el => el.style.fontSize || null,
      renderHTML: a => a.fontSize ? { style: `font-size: ${a.fontSize}` } : {},
    } } }];
  },
  addCommands: () => ({
    setFontSize: size => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
    unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
  }),
});

// line spacing on paragraphs and headings (1.0, 1.15, 1.5, 2.0…)
const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions: () => ({ types: ['paragraph', 'heading'] }),
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { lineHeight: {
      default: null,
      parseHTML: el => el.style.lineHeight || null,
      renderHTML: a => a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {},
    } } }];
  },
  addCommands() {
    return {
      setLineHeight: v => ({ commands }) => this.options.types.every(t => commands.updateAttributes(t, { lineHeight: v })),
      unsetLineHeight: () => ({ commands }) => this.options.types.every(t => commands.resetAttributes(t, 'lineHeight')),
    };
  },
});

// a paragraph can be a Caption (small, soft) or a Lead (a bigger intro paragraph)
const ParaStyle = Extension.create({
  name: 'paraStyle',
  addGlobalAttributes() {
    return [{ types: ['paragraph'], attributes: { kind: {
      default: null,
      parseHTML: el => el.getAttribute('data-kind'),
      renderHTML: a => a.kind ? { 'data-kind': a.kind, class: 'p-' + a.kind } : {},
    } } }];
  },
});

// everything a Mochiboard doc can hold
const extensions = (placeholder = 'Start writing…') => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline, TextStyle, Color, FontFamily, FontSize, LineHeight, ParaStyle, Subscript, Superscript,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
  Placeholder.configure({ placeholder: ({ node }) => node.type.name === 'heading' ? 'Heading' : placeholder }),
  TaskList, TaskItem.configure({ nested: true }),
  Image.configure({ inline: false, allowBase64: true }),
  Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
  Typography, CharacterCount,
];

export { Editor, BubbleMenu, extensions, generateHTML, generateJSON, getHTMLFromFragment };
