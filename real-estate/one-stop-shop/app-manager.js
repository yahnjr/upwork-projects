const tabs = document.querySelectorAll('.navigation-button');
    const wrappers = document.querySelectorAll('.app-wrapper');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            wrappers.forEach(w => w.classList.remove('active-app'));

            tab.classList.add('active');

            const id = tab.id.replace('-tab', '-wrapper');
            const wrapper = document.getElementById(id);
            if (wrapper) wrapper.classList.add('active-app');
        });
    });

    document.getElementById('agents-tab').click();