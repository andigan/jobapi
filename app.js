// set up server
var config = require('./config/config.js'),   // import config variables
    port = config.port,                       // set the port
    express = require('express'),             // use express as the framwork
    app = express(),                          // create the server using express
    path = require('path'),                   // utility module
    bodyParser = require('body-parser'),

    async = require('async'),
    Promise = require('bluebird'),

    scrapeIt = require('scrape-it'),

    xl = require('excel4node'),

    secrets = require('./config/secrets.js');

// support parsing of application/json type post data
app.use(bodyParser.json());

// support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public'))); // this middleware serves static files, such as .js, .img, .css files

// Initialize server
var server = app.listen(port, function () {
  console.log('Listening on port %d', server.address().port);
});

// Initialize server-side socket.io
var io = require('socket.io').listen(server);

var jobsArr = [], // placeholder for db
    limit = 25, // max number of results per api call
    topSalary = 300; // K

// used to interrupt fetches
config.keepGoing = true;

// function to make the url with the initial record; return the query and the url
// if query.jobtype and query.salary are null, interpolate ''
function makeUrl(initial, query) {
  return [query, `http://api.indeed.com/ads/apisearch?publisher=${secrets.pubID}&q=${query.query}&l=${query.location}&sort=date&radius=${query.radius}&st=&jt=${query.jobtype}&start=${initial}&limit=${limit}&fromage=&salary=${query.salary}&filter=1&latlong=1&co=us&chnl=&userip=1.2.3.4&format=json&useragent=Mozilla/%2F4.0%28Firefox%29&v=2`];
}

// a function to return makeUrl as a promise
function makeUrlPromise(initial, query) {
  return new Promise((resolve) => {
    resolve(makeUrl(initial, query));
  });
}



// receives form input from client
app.post('/fetch-data-from-api', function (req, res) {
    // prepare form data for query string
    let as_and = req.body.as_and.toLowerCase().split(' ').join('%20'),
        as_phr = req.body.as_phr.toLowerCase().split(' ').join('%20'),
        as_any = (req.body.as_any !== '')? '(' + req.body.as_any.toLowerCase().split(' ').join(' or ') + ')' : '',
        as_not = (req.body.as_not !== '')? '-' + req.body.as_not.toLowerCase().split(' ').join('%20') : '',
        as_ttl = (req.body.as_ttl !== '')? 'title:' + req.body.as_ttl.toLowerCase().split(' ').join('%20'): '',
        as_cmp = (req.body.as_cmp !== '')? 'company:' + req.body.as_cmp.toLowerCase().split(' ').join('%20'): '';

  var query = {
    query: `${as_and}%20"${as_phr}"%20${as_any}%20${as_not}%20${as_ttl}%20${as_cmp}`,
    location: req.body.location.toLowerCase().split(' ').join('+'),
    radius: req.body.radius
  };

  // send response
  res.send();

  // switch keepGoing on
  config.keepGoing = true;

  // experimental callback
  function tryme(query) {
    console.log(`callback query: ${query.query}`);
  }

  // main flow of execution
  async function mainFlow () {

    // convert array to query-friendly string
    function getSalaryString(range) {
      return `%24${range[0]}K-%24${range[1]}K`;
    }

    let jobTypes = ['fulltime', 'parttime', 'contract', 'internship', 'temporary'],
        salaryRanges = [];

    // prepare an array of salary ranges
    for (let i = 0; i < topSalary; i = i + 10) {
      salaryRanges.push([i, i + 10]);
    }

    // initial fetch; fetches all jobs
    await mainFetch(Object.assign({}, query, {callback: tryme}));

    // jobtype fetches; map jobType array to fetches
    await Promise.map(jobTypes, function (jobType) {

      if (config.keepGoing) {
        return mainFetch(Object.assign({}, query, { jobtype: jobType}, {callback: tryme}));
      } else {
        return null;
      }
    }, {concurrency: 2});

    // salary fetches; map salaries array to fetches
    await Promise.map(salaryRanges, function (range) {

      if (config.keepGoing) {
        return mainFetch(Object.assign({}, query, { salary: getSalaryString(range)}, { salaryhuman: `$${range[0]}K-${range[1]}K`}, {callback: tryme}));
      } else {
        return null;
      }
    }, {concurrency: 2});

    // emit state changes to client
    io.emit('updateDescriptionsCount', jobsArr.filter(function (job) {
      return !!job.description;
    }).length);

    io.emit('enableProcessButtons');

  }

  mainFlow()
});


function mainFetch(query) {

    // primary fetch function; return promise of [query, fetchedData]; execute callback
    function fetchApi(url, propName, callback) {

      // return a promise
      return new Promise((resolve, reject) => {
        // select http or https module, depending on reqested url
        const lib = url[1].startsWith('https') ? require('https') : require('http'),
            request = lib.get(url[1], (response) => {

              // handle http errors
              if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error('Failed to load resource, status code: ' + response.statusCode));
              };
              // temporary data holder
              const body = [];

              // on every content chunk, push it to the data array
              response.on('data', (chunk) => body.push(chunk));

              // resolve promise with joined chunks and selected property
              response.on('end', () => {

                if (callback) callback([url[0], JSON.parse(body.join(''))[propName]]);

                resolve([url[0], JSON.parse(body.join(''))[propName]]);
              });
            });

        // handle connection errors of the request
        request.on('error', (err) => reject(err));
      });
    }

    function initialCallback(totalResults) {
      console.log('initialCallback: Initial API fetch completed.');
      io.emit('totalResults', totalResults[1]);
    }


  // do an initial call to get the total number of results
  // only pass initialCallback on initial fetch
    return fetchApi(makeUrl(0, query), 'totalResults', !(query.salary || query.jobtype)? initialCallback:null).then(function (totalResults) {
      console.log(`fetchApi then: total results: ${totalResults[1]}`);

      let numOfCalls = Math.ceil(totalResults[1] / limit),
          urls = [],
          fetchPromises;

      // create urls to fetch with initial record and API limit; [[query, url], [query, url]...]
      for (var i = 0; i < numOfCalls; i++) {
        urls.push(makeUrlPromise(i * limit, query));
      };

      // excuted after a fetch
      function apiCallback(fetchedJobs) {

        if (fetchedJobs && config.keepGoing) {

          // for each fetched job
          fetchedJobs[1].forEach(function (newJob) {
            // only add when job is unique
            // urls are unique(!); encoded differently for every api request

            // look for a match in the jobsArr
            var match = jobsArr.find(function (oldJob) {
              return (oldJob.jobkey === newJob.jobkey) && (oldJob.date === newJob.date);
            });

            // if there's a match
            if (match) {

              // and the fetch query has a jobtype
              if (fetchedJobs[0].jobtype) {

                // if the matched job has a jobtype...
                if (match.jobtype) {
                  // find if the matched job already has the jobtype
                  var x = match.jobtype.findIndex(function(existingJobtype) {
                    return (fetchedJobs[0].jobtype === existingJobtype);
                  });
                }

                // assign the jobtype to the matched job
                match.jobtype = (match.jobtype && (x === -1))? match.jobtype.concat(fetchedJobs[0].jobtype) : [fetchedJobs[0].jobtype];

              io.emit('updateJobtypeCounter', jobsArr.filter(function (job) {
                return !!job.jobtype;
              }).length);

              // if the fetch query has a salary
              } else if (fetchedJobs[0].salary) {

                // if the matched job has a salary...
                if (match.salary) {
                  // find if the matched job already has the salary range
                  var x = match.salary.findIndex(function(existingSalary) {
                    return (fetchedJobs[0].salaryhuman === existingSalary);
                  });
                }

                // assign the salary to the matched job
                match.salary = (match.salary && (x === -1))? match.salary.concat(fetchedJobs[0].salaryhuman) : [fetchedJobs[0].salaryhuman];

                io.emit('updateSalaryCounter', jobsArr.filter(function (job) {
                  return !!job.salary;
                }).length);
              };
            // else when the job is new and unique
            } else {
              // add the job to the jobs array
              jobsArr = jobsArr.concat(newJob);

              io.emit('updateJobsCounter', jobsArr.length);
            }
          });
        }
      }

      // bluebird method which maps an array (or array of promises) to a promise array
      // and allows concurrency to be limited
      fetchPromises = Promise.map(urls, function (url) {

        // here a promise is initiated after a previous one resolves
        if (config.keepGoing) {
          // send the url [query, url], requested key, and callback to fetch function
          return fetchApi(url, 'results', apiCallback);
        } else {
          return null;
        }
      }, {concurrency: 2});

      // when all fetchPromises are resolved... return...
      return Promise.all(fetchPromises).then(function (resultsArr) {
        console.log(`${resultsArr.length} mainFetch API calls completed.`);
        if (resultsArr.length === 0) {
          return function() {
            console.log('nothing here');
          }

        } else {
        // return the callback that was attached to the query object in the mainfetch calls
        return resultsArr[0][0].callback(resultsArr[0][0]);

        }

      }).catch(function (err) {
        console.log(err);
        console.log('error with any API fetch.');
      });

    }).catch(function (err) {
      console.log(err);
      console.log('error with initial call.');
    });

}


// return the jobsArr
app.get('/get-jobs', function (req, res) {
  let x = jobsArr.filter(function (job) {
    return !!job.description;
  });

  res.send({summaryCount: x.length, jobs: jobsArr});
});

// clear the data file
app.get('/clear', function (req, res) {
  config.keepGoing = false;
  jobsArr = [];
  res.send();
});

// construct and return a xlxs file
app.get('/get-xlsx', function (req, res) {
  var wb = new xl.Workbook(),          // Create a new instance of a Workbook class
      ws = wb.addWorksheet('Indeed Jobs'), // Add Worksheets to the workbook
      style = wb.createStyle({         // Create a reusable style

        font: {
          color: '#000000',
          size: 12
        },
        numberFormat: '$#,##0.00; ($#,##0.00); -'
      }),
      row = 0;

  async.each(jobsArr, function (result, callback) {

    row = row + 1;

    // Set value of cell A2 to 'string' styled with paramaters of style
    ws.cell(row,1).string(result.jobtitle).style(style);
    ws.cell(row,2).string(result.company).style(style);

    if (result.description) {
      ws.cell(row,3).string(result.description).style(style);
    } else {
      ws.cell(row,3).string('not fetched').style(style);
    };

    if (result.jobtype) {
      ws.cell(row,4).string(result.jobtype).style(style);
    } else {
      ws.cell(row,4).string('not fetched').style(style);
    };

    if (result.salary) {
      ws.cell(row,5).string(result.salary).style(style);
    } else {
      ws.cell(row,5).string('not fetched').style(style);
    };


    ws.cell(row,6).string(result.city).style(style);
    ws.cell(row,7).string(result.state).style(style);
    ws.cell(row,8).string(result.country).style(style);
    ws.cell(row,9).string(result.language).style(style);
    ws.cell(row,10).string(result.formattedLocation).style(style);
    ws.cell(row,11).string(result.source).style(style);
    ws.cell(row,12).string(result.date).style(style);
    ws.cell(row,13).string(result.snippet).style(style);
    ws.cell(row,14).string(result.url).style(style);

    ws.cell(row,15).string(result.latitude.toString()).style(style);
    ws.cell(row,16).string(result.longitude.toString()).style(style);
    ws.cell(row,17).string(result.jobkey).style(style);
    ws.cell(row,18).string(result.sponsored.toString()).style(style);
    ws.cell(row,19).string(result.expired.toString()).style(style);
    ws.cell(row,20).string(result.indeedApply.toString()).style(style);
    ws.cell(row,21).string(result.formattedLocationFull).style(style);
    ws.cell(row,22).string(result.formattedRelativeTime).style(style);
    ws.cell(row,23).string(result.stations).style(style);
    callback(); // executing callback without params communicates the iteration was successful
  }, function (err) {
    if (err) console.error(err);
    wb.write('ExcelFile.xlsx', res);
  });
});

app.get('/attach-descriptions', function (req, res) {
  res.send();

  addDescriptionsToJobs(jobsArr);

});

function addDescriptionsToJobs(allJobsArr) {

  Promise.map(allJobsArr.filter(function (job) {
    return !job.description;
  }), function (job) {

    // another promise is initiated
    if (config.keepGoing) {
      return fetchDescription(job);
    } else {
      return null;
    }

  }, {concurrency: 2}).then(function () {
    console.log('all description promises resolved.');
    if (jobsArr.length > 1) {
      io.emit('enableProcessButtons');
    }
  });


  function fetchDescription(job) {
    if (job.description) {
      console.log('already have this description...');
      return;
    } else {

      console.log(`scrape attempt ${job.jobkey}`);
      return scrapeIt(job.url, { description: '#job_summary' } ).then(function (result) {

        console.log(`scrape complete: ${job.jobkey} ${result.description.substring(0,5)}`);

        // add the description to the job (objects within arrays are passed by reference)
        job.description = result.description;

        // report number of jobs with descriptions
        if (jobsArr.length > 1) {
          io.emit('updateDescriptionsCount', jobsArr.filter(function (job) {
            return !!job.description;
          }).length);
        }
        // return [job, result.description];

      }).catch(function (err) {
        console.log('connection error, most likely.');
        return ['error', err];
      });
    }
  };
};
