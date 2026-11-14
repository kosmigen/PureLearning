/*! Magic UI Marquee · MIT · https://magicui.design/r/marquee.json */
import './marquee.css';

// The registry component's Tailwind utilities are expressed as local CSS
// classes so the MkDocs site can use it without a Tailwind build.
export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  ...props
}) {
  return (
    <div
      {...props}
      className={`magic-marquee${className ? ` ${className}` : ''}`}
      data-vertical={vertical || undefined}
      data-reverse={reverse || undefined}
      data-pause-on-hover={pauseOnHover || undefined}
    >
      {Array(repeat).fill(0).map((_, index) => (
        <div className="magic-marquee__track" key={index}>{children}</div>
      ))}
    </div>
  );
}
