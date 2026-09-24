const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body instanceof FormData
                ? {}
                : { 'Content-Type': 'application/json' }),
            ...(options.headers || {})
        }
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message =
            typeof payload === 'object' && payload?.error
                ? payload.error
                : `Request failed with status ${response.status}`;

        if (response.status === 401) {
            window.location.href = '/login';
        }

        throw new Error(message);
    }

    return payload;
};

const escapeText = (value) => String(value ?? '');

const getBookCover = (book) =>
    book.cover_image ||
    book.coverImage ||
    '/images/default-cover.png';

const getBookMode = (book) =>
    String(book.mode || 'pdf').toLowerCase();
