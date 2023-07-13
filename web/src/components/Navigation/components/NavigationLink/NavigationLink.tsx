import { useMatch } from 'react-router';
import { Link } from 'react-router-dom';

import { NavigationItem } from '../../types';

interface NavigationLinkProps {
  item: NavigationItem;
  callback?: () => void;
}

export const NavigationLink = ({ item, callback }: NavigationLinkProps) => {
  const match = useMatch(item.linkPath);
  return (
    <Link
      replace
      to={item.linkPath}
      className={match ? 'active' : undefined}
      onClick={() => {
        if (callback) {
          callback();
        }
        if (item.onClick) {
          item.onClick();
        }
      }}
    >
      {item.icon}
      <span>{item.title}</span>
      {match ? <div className="active-line" /> : null}
    </Link>
  );
};
