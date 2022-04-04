const fetch = require('cross-fetch')
const Bottleneck = require('bottleneck/es5')

const domain = 'https://www.canada.ca/'

// Limit concurrent requests
var limiter = new Bottleneck({
    reservoir: 100,
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 30000,
    maxConcurrent: 5,
})


function noCache() {
    return '?_=' + new Date().getTime()
}

function normalizeNode(node) {
    if (typeof node === 'string') {
        node = { path: node }
    }

    if (typeof node === 'object' && typeof node.path === 'string') {
        var match = node.path.match(/(^|\/)(en|fr)(\/?[^\.?]*|$)/)
        if (!match) {
            throw new Error('Invalid node path ' + node.path)
        }
        node.path = match[0].replace(/^\/|\/$/g, '')
        return node
    }

    throw new Error('Invalid node')
}

function normalizeAsset(path) {
    if (typeof path === 'string') {
        var match = path.match(/(^|\/)content\/dam\/([^?]*|$)/)
        if (!match) {
            throw new Error('Invalid asset path ' + path)
        }
        return match[0].replace(/^\/|\/$/g, '')
    }

    throw new Error('Invalid asset')
}

function fetchContent(response) {
    if (!response.ok) {
        throw new Error(response.statusText)
    } else if (response.url.indexOf(domain) !== 0) {
        throw new Error('Redirect')
    } else if (response.url.indexOf('/errors/404.html') !== -1) {
        throw new Error('Not Found')
    }

    if (response.headers.get('content-type') === 'application/json;charset=utf-8') {
        return response.json()
    }

    return response.text()
}



export function children(nodes, node) {
    node = normalizeNode(node)

    return limiter.schedule(fetch, domain + node.path + '.sitemap.xml' + noCache())
        .then(fetchContent)
        .then(function (xml) {
            var empty = nodes.length == 0

            

            
            xml.match(/<url>(.*?)<\/url>/g).forEach(function (url) {
                var path = normalizeNode(url).path
                var date = Date.parse(url.match(/\d{4}-\d{2}-\d{2}/)[0]) / 1000
                if (!empty) {
                    for (var i = nodes.length - 1; i >= 0; i--) {
                        if (nodes[i].path === path) {
                            nodes[i].lastmod = date
                            return
                        }
                    }
                }
                nodes.push({ path: path, lastmod: date })
            })

            return nodes
        })
        .catch(function (e) {
            console.error(e)
            return nodes
        })
}

export function meta(node) {
    node = normalizeNode(node)

    return limiter.schedule(fetch, domain + node.path + '/jcr:content.json' + noCache())
        .then(fetchContent)
        .then(function (json) {
            for (var key in json) {
                if (json[key] === 'true') {
                    json[key] = true
                } else if (json[key] === 'false') {
                    json[key] = false
                } else if (key.indexOf('@TypeHint') !== -1) {
                    delete json[key]
                } else if (/[\d\:]{8} \w{3}-\d{4}$/.test(json[key])) {
                    json[key] = Date.parse(json[key]) / 1000
                }
            }

            node.meta = json
            return node
        })
        .catch(function (e) {
            node.meta = e
            return node
        })
}


export function html(node) {
    node = normalizeNode(node)

    return limiter.schedule(fetch, domain + node.path + '.html' + noCache())
        .then(fetchContent)
        .then(function (html) {
            node.html = html.trim().replace(/\s{2,}/g, ' ')
            return node
        })
        .catch(function (e) {
            node.html = e
            return node
        })
}

export function assetMeta(path) {
    path = normalizeAsset(path)

    return limiter.schedule(fetch, domain + path + '/jcr:content.json' + noCache())
        .then(fetchContent)
        .then((json) => {
            json.path = path
            return json
        })
        .catch((e) => e)
}
