import { createRoot } from 'react-dom/client';
import { Marquee } from './Marquee.jsx';

function SkillsWall({ groups }) {
  return (
    <div className="kb-skills-wall__plane" style={{ '--kb-column-count': groups.size }}>
      {[...groups.entries()].map(([column, skills], index) => (
        <Marquee
          key={column}
          className="kb-skills-wall__column"
          vertical
          pauseOnHover
          reverse={index % 2 === 1}
          repeat={4}
          style={{ '--kb-column-delay': `-${3 + index * 4}s` }}
        >
          {skills.map(({ image, name }) => (
            <div className="kb-skills-wall__tile" key={name}>
              <img src={image} alt="" width="48" height="48" />
              <span>{name}</span>
            </div>
          ))}
        </Marquee>
      ))}
    </div>
  );
}

export function mountSkillsWall(wall, list) {
  const groups = new Map();
  for (const item of list.children) {
    const image = item.querySelector('img');
    const name = item.textContent.trim();
    if (!image || !name) continue;
    const column = item.dataset.column;
    if (!groups.has(column)) groups.set(column, []);
    groups.get(column).push({ image: image.src, name });
  }
  const root = createRoot(wall);
  root.render(<SkillsWall groups={groups} />);
  return () => root.unmount();
}
