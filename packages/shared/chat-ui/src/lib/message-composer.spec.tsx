import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatRequestError } from './chat-api';
import { MessageComposer } from './message-composer';

const file = (name: string, type = 'image/png', size = 1024) => {
  const picked = new File(['x'], name, { type });
  Object.defineProperty(picked, 'size', { value: size });
  return picked;
};

function pick(files: File[]) {
  fireEvent.change(screen.getByLabelText('Choose photos or documents'), {
    target: { files },
  });
}

const filesToSend = () =>
  screen.getByRole('list', { name: 'Files to send' }).children;

beforeEach(() => {
  localStorage.clear();
});

describe('MessageComposer', () => {
  it('sends trimmed text on Enter and clears the box', async () => {
    const onSend = vi.fn(async () => true);
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText('Message');

    fireEvent.change(box, { target: { value: '  Hi there  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(box).toHaveValue(''));
    expect(onSend).toHaveBeenCalledWith({ body: 'Hi there', files: [] });
  });

  it('keeps Shift+Enter for new lines and blocks empty messages', () => {
    const onSend = vi.fn(async () => true);
    render(<MessageComposer onSend={onSend} />);

    fireEvent.keyDown(screen.getByLabelText('Message'), {
      key: 'Enter',
      shiftKey: true,
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('keeps the text when sending fails', async () => {
    const onSend = vi.fn(async () => false);
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText('Message');

    fireEvent.change(box, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(box).toHaveValue('Hello');
  });

  it('takes photos and documents up to 10 MB, four at a time', async () => {
    const onSend = vi.fn(async () => true);
    render(<MessageComposer onSend={onSend} />);

    pick([file('setup.exe', 'application/x-msdownload')]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      '“setup.exe” can’t be shared',
    );

    pick([file('scan.pdf', 'application/pdf', 12.4 * 1024 * 1024)]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      '“scan.pdf” is 12.4 MB, which is over the 10 MB limit. Please compress it to under 10 MB and try again.',
    );

    pick([
      file('a.png'),
      file('b.png'),
      file('c.png'),
      file('d.png'),
      file('e.png'),
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'up to 4 photos or documents',
    );
    expect(filesToSend()).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove b.png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove c.png' }));
    pick([file('report.docx', '', 2048)]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(filesToSend()).toHaveLength(2);
    expect(screen.getByText('2 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        body: '',
        files: [expect.any(File), expect.any(File)],
      }),
    );
  });

  it('inserts emoji where the cursor is and remembers them', () => {
    render(<MessageComposer onSend={vi.fn(async () => true)} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Thanks!' } });
    box.setSelectionRange(6, 6);

    fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    fireEvent.change(screen.getByPlaceholderText('Search emoji'), {
      target: { value: 'pray' },
    });
    fireEvent.click(screen.getByRole('button', { name: '🙏' }));

    expect(box).toHaveValue('Thanks🙏!');
    expect(screen.queryByRole('dialog', { name: 'Emoji' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    expect(
      screen.getByRole('tab', { name: 'Recently used', selected: true }),
    ).toBeInTheDocument();
  });

  it('sends a GIPHY sticker on its own', async () => {
    const onSend = vi.fn(async () => true);
    const searchGifs = vi.fn(async () => ({
      results: [
        {
          id: 'g1',
          title: 'Thank you',
          url: 'https://media.giphy.com/media/g1/200.gif',
          width: 200,
          height: 200,
          previewUrl: 'https://media.giphy.com/media/g1/100.gif',
        },
      ],
      next: null,
    }));
    render(<MessageComposer onSend={onSend} searchGifs={searchGifs} />);

    fireEvent.click(screen.getByRole('button', { name: 'GIFs and stickers' }));
    expect(screen.getByText('Powered by GIPHY')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    await waitFor(() =>
      expect(searchGifs).toHaveBeenLastCalledWith('stickers', ''),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Thank you' }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        body: '',
        files: [],
        gif: {
          kind: 'sticker',
          url: 'https://media.giphy.com/media/g1/200.gif',
          width: 200,
          height: 200,
          title: 'Thank you',
        },
      }),
    );
  });

  it('shows why GIFs can’t load', async () => {
    render(
      <MessageComposer
        onSend={vi.fn(async () => true)}
        searchGifs={vi.fn(async () => {
          throw new ChatRequestError(
            'GIFs and stickers aren’t set up yet. Add a GIPHY_API_KEY to chatting-service.',
            503,
          );
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'GIFs and stickers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'GIFs and stickers aren’t set up yet',
    );
  });

  it('edits a message in place and brings back the draft afterwards', async () => {
    const onSaveEdit = vi.fn(async () => true);
    const onCancelEdit = vi.fn();
    const { rerender } = render(
      <MessageComposer onSend={vi.fn(async () => true)} />,
    );
    const box = screen.getByLabelText('Message');
    fireEvent.change(box, { target: { value: 'Half-written' } });

    const editing = { id: 'm1', body: 'Old text', canBeEmpty: false };
    rerender(
      <MessageComposer
        onSend={vi.fn(async () => true)}
        editing={editing}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
      />,
    );
    expect(box).toHaveValue('Old text');
    expect(screen.getByText('Editing message')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Attach photos or documents' }),
    ).toBeNull();

    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'New text' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSaveEdit).toHaveBeenCalledWith('New text'));

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onCancelEdit).toHaveBeenCalled();

    rerender(<MessageComposer onSend={vi.fn(async () => true)} />);
    expect(box).toHaveValue('Half-written');
  });

  it('shows what is being replied to', () => {
    const onCancelReply = vi.fn();
    render(
      <MessageComposer
        onSend={vi.fn(async () => true)}
        replyingTo={{ senderName: 'Amina', preview: 'Do you deliver?' }}
        onCancelReply={onCancelReply}
      />,
    );

    expect(screen.getByText('Replying to Amina')).toBeInTheDocument();
    expect(screen.getByText('Do you deliver?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalled();
  });

  it('warns near the length limit and blocks past it', () => {
    render(<MessageComposer onSend={vi.fn(async () => true)} />);

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'a'.repeat(2001) },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('2001 / 2000');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
