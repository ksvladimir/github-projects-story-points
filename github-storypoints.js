(function() {
'use strict';

var estimateRegEx = /^([\d\.]+) pt$/im;
const activeColumns = ['📅 Planned', '🚧 In progress', '👀 In review', '🔬 In QA'];
const closedColumns = ['📦 Done', '✅ Accepted'];

const githubCredentials = new Promise(resolve => {
  chrome.storage.sync.get({ githubUser: '', githubToken: '' }, items => resolve(items));
});

const debounce = function (func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    const later = function() {
      timeout = null;
      func.apply(context, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const getColumnCards = (column) => {
  return Array
    .from(column.getElementsByClassName('issue-card'))
    .filter(card => !card.classList.contains('sortable-ghost'))
    .filter(card => getComputedStyle(card).getPropertyValue('display') != 'none');
}

const moveTo = (card_id, position) => async (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.target.innerHTML = '⏳';

  const { githubUser, githubToken } = await githubCredentials;
  if (!githubUser || !githubToken) {
    alert('please set github credentials in Github Projects Story Points settings');
    return;
  }

  const res = await fetch(
    `https://api.github.com/projects/columns/cards/${card_id}/moves`, {
      headers: {
        'Authorization': 'Basic ' + btoa(githubUser + ":" + githubToken),
        'Accept': 'application/vnd.github.inertia-preview+json',
      },
      method: 'POST',
      body: JSON.stringify({ position }),
    }
  );
  if (!res.ok) {
    console.error(`Github API error: ${res.statusTest}\n${await res.text()}`);
    alert(`Github API error: ${res.statusTest}`);
  } else {
    /*
    const parentNode = card.parentNode;
    if (parentNode && position === 'top') {
      parentNode.prepend(card);
    } else if (parentNode && position === 'bottom') {
      parentNode.insertBefore(card, null);
    }
    */
  }

  return false;
}

const addCardButtonsForColumn = (column) => {
  getColumnCards(column)
    .filter(card => card.querySelectorAll('.gpsp-card-buttons').length == 0)
    .forEach(card => {
      const buttons = document.createElement('div');
      buttons.classList.add('gpsp-card-buttons');

      const addButton = (text, dir) => {
        const button = document.createElement('div');
        button.innerText = text;
        button.addEventListener('click', moveTo(card.dataset.cardId, dir), {capture: true});
        button.addEventListener('mousedown', e => { e.preventDefault(); }, {capture: true});
        buttons.append(button);
      };
      addButton('↑', 'top');
      addButton('↓', 'bottom');

      card.append(buttons);
    });

};

// extract story points for all visible issues
const extractStoryPoints = () => {
  console.log('extracting points');
  const result = [];

  const project = document.querySelector('.project-columns-container');
  const columns = project.querySelectorAll('.js-project-column');
  for (const columnElement of columns) {
    const column = {
      name: columnElement.getElementsByClassName('js-project-column-name')[0].innerText,
      element: columnElement,
    };

    const cards = getColumnCards(columnElement);
    for (const card of cards) {
      const issueContainer = card.querySelector(
        'article > div > div > .js-project-issue-details-container, ' +
        '.js-issue-note > .js-project-issue-details-container');

      if (!issueContainer) {
        continue; // this is a note
      }

      const number = issueContainer.querySelector('.js-issue-number').innerText;
      const assigneeButtons =
        [...issueContainer.querySelectorAll('button[data-card-filter^="assignee:"]')];
      const assignees = assigneeButtons.map(el => ({
        name: el.dataset.cardFilter.substring("assignee:".length), button: el,
      }));

      // compute sum of all labels matching estimate regexp
      const estimates = Array
        .from(issueContainer.getElementsByClassName('IssueLabel'))
        .map(label => parseFloat((label.innerText.trim().match(estimateRegEx) || [null, ''])[1]))
        .filter(x => !isNaN(x));

      const points = estimates.length > 0 ? estimates.reduce((x, y) => x + y, 0) : NaN;
      result.push({number, points, column, assignees});
    }
  }

  return result;
};

const addStoryPoints = (acc, issue) => {
  if (!isNaN(issue.points)) { acc.points += issue.points; }
  else { acc.unestimated += 1; }
  return acc;
}

const aggStoryPoints = (issues, filter) =>
  issues.filter(filter).reduce(addStoryPoints, { points: 0, unestimated: 0 });

const getOrAppendChild = (parent, cls, newEl, insertBefore = null) => {
  const matches = parent.getElementsByClassName(cls);
  if (matches.length > 0) {
    return matches[0];
  } else {
    const el = typeof newEl === 'string' ? document.createElement(newEl) : newEl();
    el.classList.add(cls);
    parent.insertBefore(el, insertBefore);
    return el;
  }
}

const updateColumnsStoryPoints = (issues) => {
  const project = document.querySelector('.project-columns-container');
  const columns = project.querySelectorAll('.js-project-column');

  for (const columnElement of columns) {
    const { points, unestimated } = aggStoryPoints(issues, i => i.column.element === columnElement);

    // Apply DOM changes:
    const countEl = columnElement.querySelector('.js-column-card-count');
    const pointsEl = getOrAppendChild(countEl, 'gpsp-column-points', 'div');
    pointsEl.innerText = `(${points} pt${unestimated ? ` + ${unestimated} unestimated` : ''})`;
  }
}

const updateTotalStoryPoints = (issues) => {
  const active = aggStoryPoints(issues, i => activeColumns.includes(i.column.name));
  const closed = aggStoryPoints(issues, i => closedColumns.includes(i.column.name));

  const fmt = ({points, unestimated}) =>
    `${points} pt${unestimated ? ` + ${unestimated} unestimated` : ''}`;

  // Apply DOM changes:
  const projectTitle = document.querySelector('.project-header .js-project-hovercard .js-project-name-label');
  const pointsElement = getOrAppendChild(projectTitle, 'gpsp-total-points', 'span');
  pointsElement.innerText = `(active: ${fmt(active)} / closed: ${fmt(closed)})`;
}

let assigneeStoryPointsState = 'active';

const updateAssigneesStoryPoints = (issues) => {
  const assigneeMap = {};
  for (const issue of issues) {
    const status =
      activeColumns.includes(issue.column.name) ? 'active' :
      closedColumns.includes(issue.column.name) ? 'closed' : undefined;

    if (status === undefined) {
      continue;
    }

    for (const assignee of issue.assignees) {
      if (!(assignee.name in assigneeMap)) {
        assigneeMap[assignee.name] = {
          button: assignee.button,
          active: { points: 0, unestimated: 0 },
          closed: { points: 0, unestimated: 0 },
        };
      }
      addStoryPoints(assigneeMap[assignee.name][status], issue);
    }
  }

  const assigneeNames = Object.keys(assigneeMap);
  assigneeNames.sort();

  const projectHeader = document.querySelector('.project-header');
  const assigneesBar = getOrAppendChild(
    projectHeader.parentNode, 'gpsp-assignees-bar', 'div', projectHeader.nextSibling);

  assigneesBar.innerHTML = '';
  const span = document.createElement('span');
  span.innerText = ' issues:';
  assigneesBar.appendChild(span);

  const statusSwitch = document.createElement('a');
  statusSwitch.classList.add('tooltipped', 'tooltipped-se', 'tooltipped-multiline');
  statusSwitch.ariaLabel =
    `Active columns:\n${activeColumns.join('\n')}\n\nClosed columns:\n${closedColumns.join('\n')}`;
  statusSwitch.href = '#';
  statusSwitch.innerText =
    assigneeStoryPointsState.charAt(0).toUpperCase() + assigneeStoryPointsState.slice(1);
  statusSwitch.addEventListener('click', (e) => {
    const statuses = ['active', 'closed', 'active / closed'];
    e.preventDefault();
    assigneeStoryPointsState = statuses[(statuses.indexOf(assigneeStoryPointsState) + 1) % 3];
    updateAssigneesStoryPoints(extractStoryPoints());
  });
  span.prepend(statusSwitch);

  const fmt = ({points, unestimated}) => `${points} pt${unestimated ? ` + ${unestimated}` : ''}`;

  assigneeNames.forEach(name => {
    const el = document.createElement('div');
    const avatar = document.createElement('span');
    avatar.classList.add('tooltipped', 'tooltipped-ne', 'tooltipped-multiline');
    avatar.ariaLabel = name;
    avatar.insertBefore(assigneeMap[name].button.cloneNode(true), null);
    el.insertBefore(avatar, null);

    const sp = document.createElement('span');
    const { active, closed } = assigneeMap[name];
    sp.innerText =
      assigneeStoryPointsState === 'active' ? `${fmt(active)}` :
      assigneeStoryPointsState === 'closed' ? `${fmt(closed)}` :
      `${fmt(active)} / ${fmt(closed)}`;
    el.insertBefore(sp, null);

    assigneesBar.insertBefore(el, null);
  });
}

// update story points widgets
const updateStoryPoints = () => {
  const issues = extractStoryPoints();

  updateColumnsStoryPoints(issues);
  updateTotalStoryPoints(issues);
  updateAssigneesStoryPoints(issues);
};

const updateStoryPointsHandler = debounce(updateStoryPoints, 100);

const start = () => {
  const project = document.querySelector('.project-columns-container');
  const columns = project.querySelectorAll('.js-project-column');

  for (const column of columns) {
    const addCardButtonsForColumnHandler = debounce(() => addCardButtonsForColumn(column), 100);
    const columnArea = column.querySelector('.js-project-column-cards');
    columnArea.addEventListener('DOMSubtreeModified', () => {
      updateStoryPointsHandler();
      addCardButtonsForColumnHandler();
    });
  }
};

const addStyle = () => {
  const sheet = document.createElement('style');
  sheet.innerHTML = `
    .gpsp-card-buttons {
      visibility: hidden;
      position: absolute;
      top: 24px;
      right: 15px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .gpsp-card-buttons div {
      width: 16px;
      text-align: center;
      cursor: pointer;
    }
    .issue-card:hover .gpsp-card-buttons {
      visibility: visible;
    }
    .gpsp-column-points {
      display: inline;
      font-size: xx-small;
      margin-left: 0.5em;
    }
    .gpsp-total-points {
      font-weight: 400;
    }
    .gpsp-assignees-bar {
      margin-top: 5px;
      padding: 0 24px 0 16px;
      display: flex;
      flex-flow: row wrap;
    }
    .gpsp-assignees-bar > div {
      margin: 0 0 0 10px;
    }
    .gpsp-assignees-bar > div > span {
      margin-right: 5px;
    }
  `;
  document.body.appendChild(sheet);
};

addStyle();
start();

window.addEventListener('statechange', () => {
  setTimeout(updateStoryPointsHandler, 500);
});

})();
