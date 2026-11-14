import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BounceCards from './BounceCards.jsx';
import FlipCard from './FlipCard.jsx';
import './bookshelf.css';

const siteRoot = new URL('../', import.meta.url);

function coverUrl(path) {
  if (!path || !URL.canParse(path, siteRoot)) return null;
  const url = new URL(path, siteRoot);
  return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
}

function Bookshelf({ books }) {
  const shelf = useRef(null);
  const [width, setWidth] = useState(0);
  const [firstBook, setFirstBook] = useState(0);
  useLayoutEffect(() => {
    const element = shelf.current;
    const measure = () => setWidth(element.clientWidth);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const compact = width < 460;
  const pageSize = compact ? 2 : 4;
  const page = Math.floor(firstBook / pageSize);
  const pageCount = Math.ceil(books.length / pageSize);
  const visibleBooks = books.slice(page * pageSize, (page + 1) * pageSize);
  const count = visibleBooks.length;
  // Reserve space for the exposed edges of the other cards and the hover motion.
  const available = width - (compact ? 32 : 68);
  const size = Math.floor(0.92 * Math.min(count === 1 ? 380 : 310, available / (1 + 0.38 * (count - 1))));
  const height = Math.round(size * 4 / 3);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = !compact && !reducedMotion && window.matchMedia('(hover: hover)').matches;
  const fanWidth = canHover ? width - 108 : available;
  const spread = count > 1 ? Math.min(size * 0.78, (fanWidth - size) / (count - 1)) : 0;

  return (
    <div className="kb-bookshelf__ui" ref={shelf}>
      {size > 0 && (
        <div className="kb-bookshelf__stage">
          <BounceCards
            key={pageSize + ':' + page}
            className="kb-bookshelf__fan"
            containerWidth="100%"
            containerHeight={height + Math.max(48, Math.ceil(height * 0.24))}
            cardSize={size}
            spread={spread}
            rotation={count === 1 ? 0 : compact ? 4 : 8}
            arc={5}
            pushDistance={18}
            hoverScale={1.035}
            bounciness={0.3}
            animationDelay={0.08}
            borderWidth={0}
            borderColor="transparent"
            radius={12}
            shadow={false}
            enableHover={canHover}
          >
            {visibleBooks.map((book, index) => {
              const cover = coverUrl(book.cover);
              return (
                <FlipCard
                  key={page * pageSize + index}
                  ariaLabel={book.title + '，翻转卡片'}
                  width={size}
                  height={height}
                  perspective={Math.round(1100 * size / 300)}
                  background="var(--kb-book-paper)"
                  color="var(--color-ink)"
                  shadow={false}
                  draggable={false}
                  hoverScale={1}
                  tilt={false}
                  glare={false}
                  front={cover ? (
                    <img className="kb-bookshelf__cover" src={cover} alt={book.title} loading="lazy" />
                  ) : (
                    <div className="kb-bookshelf__title-cover">
                      <strong>{book.title}</strong>
                      {book.author && <span>{book.author}</span>}
                    </div>
                  )}
                  back={(
                    <div className="kb-bookshelf__back">
                      {cover && <img className="kb-bookshelf__back-cover" src={cover} alt="" loading="lazy" />}
                      <div className="kb-bookshelf__back-text">
                        <h3>{book.title}</h3>
                        {book.note && <p className="kb-bookshelf__note">{book.note}</p>}
                        {book.author && <span className="kb-bookshelf__author">{book.author}</span>}
                      </div>
                    </div>
                  )}
                />
              );
            })}
          </BounceCards>
        </div>
      )}
      {pageCount > 1 && (
        <div className="kb-bookshelf__pages">
          <button type="button" disabled={page === 0} onClick={() => setFirstBook((page - 1) * pageSize)}>上一组</button>
          <span aria-live="polite">{page + 1} / {pageCount}</span>
          <button type="button" disabled={page === pageCount - 1} onClick={() => setFirstBook((page + 1) * pageSize)}>下一组</button>
        </div>
      )}
    </div>
  );
}

export function mountBookshelf(element) {
  const books = JSON.parse(element.dataset.bookshelf);
  const root = createRoot(element);
  root.render(<Bookshelf books={books} />);
  return () => root.unmount();
}
