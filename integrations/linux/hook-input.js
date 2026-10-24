import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';

/** Read the JSON line supplied by Codex to a command hook. */
export function readHookInput(maxInputBytes) {
    const input = new Gio.DataInputStream({
        base_stream: new GioUnix.InputStream({fd: 0, close_fd: false}),
    });
    const [line, length] = input.read_line_utf8(null);
    if (typeof line !== 'string' || length > maxInputBytes)
        return null;

    return JSON.parse(line);
}
