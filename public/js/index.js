let socket = io.connect([location.protocol, '//', location.host, location.pathname].join(''));

var clientID = '';

socket.on('setclientID', function(data) {
  clientID = data;
});

// display the number of connected clients
socket.on('totalResults', function (data) {
  document.getElementById('estimate-container').style.opacity = 1;
  document.getElementById('estimate-count').textContent = data;
  document.getElementById('preview-data-button').classList.remove('off');
});

socket.on('checkitout', function (data) {
  console.log(data);
});


socket.on('updateJobsCounter', function (data) {
  document.getElementById('job-count-container').style.opacity = 1;
  document.getElementById('job-count').textContent = data;
});

socket.on('updateSalaryCounter', function (data) {
  document.getElementById('salary-count-container').style.opacity = 1;
  document.getElementById('salary-count').textContent = data;
});

socket.on('updateJobtypeCounter', function (data) {
  document.getElementById('jobtype-count-container').style.opacity = 1;
  document.getElementById('jobtype-count').textContent = data;
});



socket.on('updateDescriptionsCount', function (data) {
  document.getElementById('summary-count-container').style.opacity = 1;
  document.getElementById('summary-count').textContent = data;
});

socket.on('enableProcessButtons', function () {
  document.getElementById('attach-summaries-submit').classList.remove('off');
  document.getElementById('create-xlsx-submit').classList.remove('off');
  document.getElementById('clear-data-submit').classList.remove('off');
});

document.getElementById('fetch-data-from-api-submit').onclick = function (event) {
  event.preventDefault();

//  https://www.indeed.com/jobs?as_and=all+these+words&as_phr=exact+phrase&as_any=at+least+one+of+these+words&as_not=none+of+these+words&as_ttl=words+in+title&as_cmp=from+company&jt=all&st=&sr=directhire&salary=&radius=25&l=Pittsburgh%2C+PA&fromage=any&limit=10&sort=&psf=advsrch


  let xhttp = new XMLHttpRequest(),
      x = Array.from(document.getElementsByClassName('input')).map(function (input) {
        return `${input.id}=${input.value}&`;
      }).join('').concat(`clientID=${clientID}`);

  if (!document.getElementById('fetch-data-from-api-submit').classList.contains('off')) {
    xhttp.open('POST', '/fetch-data-from-api', true);
    xhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhttp.send(x);
  }
};

document.getElementById('preview-data-button').onclick = function (event) {
  event.preventDefault();

  if (!document.getElementById('preview-data-button').classList.contains('off')) {
    let xhttp = new XMLHttpRequest();

    xhttp.onreadystatechange = function () {
      if (this.readyState == 4 && this.status == 200) {

        let mixedresults = JSON.parse(xhttp.responseText),
            results = mixedresults.jobs;


        document.getElementById('job-count-container').style.opacity = 1;
        document.getElementById('job-count').textContent = results.length;

        document.getElementById('summary-count-container').style.opacity = 1;
        document.getElementById('summary-count').textContent = mixedresults.summaryCount;

        document.getElementById('posts').innerHTML = '';

        if (results.length > 0) {
          document.getElementById('create-xlsx-submit').classList.remove('off');
          document.getElementById('clear-data-submit').classList.remove('off');
        };

        results.forEach(function (result) {
          let jobEl = document.createElement('div'),
              titleEl = document.createElement('div'),
              jobtypeEl = document.createElement('div'),
              salaryEl = document.createElement('div'),
              companyEl = document.createElement('div'),
              dateEl = document.createElement('div'),
              snippetEl = document.createElement('div'),
              locationEl = document.createElement('div'),
              descriptionEl = document.createElement('div'),
              linkEl = document.createElement('a'),
              url = result.url,
              formattedDate = `${result.date.substring(8, 11)} ${result.date.substring(5,7)}`;

          jobEl.classList.add('job');
          titleEl.classList.add('job-title');
          companyEl.classList.add('job-company');
          dateEl.classList.add('job-date');
          descriptionEl.classList.add('job-description');
          snippetEl.classList.add('job-snippet');
          locationEl.classList.add('job-location');
          jobtypeEl.classList.add('job-jobtype');
          salaryEl.classList.add('job-salary');

          titleEl.textContent = result.jobtitle;
          companyEl.textContent = result.company;
          dateEl.textContent = formattedDate;
          snippetEl.innerHTML = result.snippet;
          locationEl.textContent = result.formattedLocation;

          linkEl.setAttribute('href', url);

          linkEl.appendChild(companyEl);

          jobEl.appendChild(titleEl);
          jobEl.appendChild(dateEl);
          if (result.salary) {
            salaryEl.innerHTML = result.salary;
            jobEl.appendChild(salaryEl);
          }
        jobEl.appendChild(locationEl);
          if (result.jobtype) {
            jobtypeEl.innerHTML = result.jobtype;
            jobEl.appendChild(jobtypeEl);
          }
            jobEl.appendChild(linkEl);
          jobEl.appendChild(snippetEl);
          if (result.description) {
            descriptionEl.innerHTML = result.description;
            jobEl.appendChild(descriptionEl);
          }

          document.getElementById('posts').appendChild(jobEl);
        });
      }
    };
    xhttp.open('POST', '/get-jobs', true);
    xhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhttp.send(`clientID=${clientID}`);
  }
};

document.getElementById('clear-data-submit').onclick = function (event) {
  event.preventDefault();

  let xhttp = new XMLHttpRequest();

  xhttp.onreadystatechange = function () {
    if (this.readyState == 4 && this.status == 200) {

      document.getElementById('estimate-container').style.opacity = 0;
      document.getElementById('job-count-container').style.opacity = 0;
      document.getElementById('summary-count-container').style.opacity = 0;
      document.getElementById('salary-count-container').style.opacity = 0;
      document.getElementById('jobtype-count-container').style.opacity = 0;

      document.getElementById('job-count').textContent = '';
      document.getElementById('summary-count').textContent = '';
      document.getElementById('salary-count').textContent = '';
      document.getElementById('jobtype-count').textContent = '';
      document.getElementById('posts').innerHTML = '';

      document.getElementById('preview-data-button').classList.add('off');
      document.getElementById('attach-summaries-submit').classList.add('off');
      document.getElementById('create-xlsx-submit').classList.add('off');
      document.getElementById('clear-data-submit').classList.add('off');
    }
  };
  xhttp.open('POST', '/clear', true);
  xhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xhttp.send(`clientID=${clientID}`);
};

document.getElementById('create-xlsx-submit').onclick = function (event) {
  event.preventDefault();
  if (!document.getElementById('create-xlsx-submit').classList.contains('off')) {
    window.open(`/get-xlsx?id=${clientID}`);
  }
};

document.getElementById('attach-summaries-submit').onclick = function (event) {
  event.preventDefault();

  if (!document.getElementById('preview-data-button').classList.contains('off')) {

    document.getElementById('attach-summaries-submit').classList.add('off');

    let xhttp = new XMLHttpRequest();

    xhttp.open('POST', '/attach-descriptions', true);
    xhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhttp.send(`clientID=${clientID}`);
  }
};
