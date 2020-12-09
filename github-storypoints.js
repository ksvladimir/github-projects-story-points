(function (d, w) {
'use strict';

var estimateRegEx = /^effort: ([\d\.]+)$/im;

var debounce = function (func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

var pluralize = (value) => (
  value === 1 ? '' : 's'
);

var resetStoryPointsForColumn = (column) => {
  const customElements = Array.from(column.getElementsByClassName('github-project-story-points'));
  for (let e of customElements) {
    const parent = e.parentNode;
    if (parent.dataset.gpspOriginalContent) {
      parent.innerText = parent.dataset.gpspOriginalContent;
      delete parent.dataset.gpspOriginalContent;
    } else {
      parent.removeChild(e);
    }
  }
};

var titleWithTotalPoints = (title, points, unestimated) => {
    let summary = `${points} pts`;
    if (unestimated > 0) {
      summary = summary + `, ${unestimated} unestimated`;
    }

    return `${title} <span class="github-project-story-points" style="font-size:xx-small">(${summary})</span>`;
};

var addStoryPointsForColumn = (column) => {
  const columnCards = Array
    .from(column.getElementsByClassName('issue-card'))
    .filter(card => !card.classList.contains('sortable-ghost'))
    .filter(card => getComputedStyle(card).getPropertyValue('display') != 'none')
    .map(card => {
      const estimates = Array
        .from(card.getElementsByClassName('IssueLabel'))
        .map(label => parseFloat((label.innerText.trim().match(estimateRegEx) || [null, ''])[1]))
        .filter(x => !isNaN(x));

      const estimated = estimates.length > 0;
      const storyPoints = estimates.reduce((x, y) => x + y, 0);

      return {
        element: card,
        estimated,
        storyPoints
      };
    });
  const columnCountElement = column.getElementsByClassName('js-column-card-count')[0];

  let columnStoryPoints = 0;
  let columnUnestimated = 0;

  for (let card of columnCards) {
    columnStoryPoints += card.storyPoints;
    columnUnestimated += (card.estimated ? 0 : 1);
  }
  // Apply DOM changes:
  if (columnStoryPoints || columnUnestimated) {
    columnCountElement.innerHTML = titleWithTotalPoints(columnCards.length, columnStoryPoints, columnUnestimated);
  }
};

var resets = [];

var start = debounce(() => {
  // Reset
  for (let reset of resets) {
    reset();
  }
  resets = [];
  // Projects
  const projects = d.getElementsByClassName('project-columns-container');
  if (projects.length > 0) {
    const project = projects[0];
    const columns = Array.from(project.getElementsByClassName('js-project-column')); // Was 'col-project-custom', but that's gitenterprise; github.com is 'project-column', fortunately, both have 'js-project-column'
    for (let column of columns) {
      const addStoryPoints = ((c) => debounce(() => {
        resetStoryPointsForColumn(c);
        addStoryPointsForColumn(c);
      }, 50))(column);
      column.addEventListener('DOMSubtreeModified', addStoryPoints);
      column.addEventListener('drop', addStoryPoints);
      addStoryPointsForColumn(column);
      resets.push(((c) => () => {
        resetStoryPointsForColumn(c);
        column.removeEventListener('DOMSubtreeModified', addStoryPoints);
        column.removeEventListener('drop', addStoryPoints);
      })(column));
    }
  }
}, 50);

// Hacks to restart the plugin on pushState change
w.addEventListener('statechange', () => setTimeout(() => {
  const timelines = d.getElementsByClassName('new-discussion-timeline');
  if (timelines.length > 0) {
    const timeline = timelines[0];
    const startOnce = () => {
      timeline.removeEventListener('DOMSubtreeModified', startOnce);
      start();
    };
    timeline.addEventListener('DOMSubtreeModified', startOnce);
  }
  start();
}, 500));

// First start
start();

})(document, window);
