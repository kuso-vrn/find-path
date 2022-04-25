/**
 * Everything related to renderer
 * Note: astar graph uses x coordinate as a rows, so x and y will be switched
 */
class SceneRenderer {
    constructor() {
        this.app = new PIXI.Application({
            width: 640,
            height: 640,
            antialias: true
        });

        this.app.stage.interactive = true;
        this.app.stage.hitArea = new PIXI.Rectangle(0, 0, 640, 640);

        this.tilemap = new PIXI.tilemap.CompositeTilemap();
        this.tilemap.containsPoint = (position) => {
            return true;
        };
        this.tilemap.interactive = true;

        this.pathLine = new PIXI.Graphics();

        this.loader = new PIXI.Loader();        
        this.loader.add('atlas', 'atlas.json');
        this.loader.load((_, resources) => {
            this.app.stage.addChild(this.tilemap);
            this.app.stage.addChild(this.pathLine);

            this.player = PIXI.Sprite.from('kappar.png');
            this.player.anchor.set(0.5);
            this.app.stage.addChild(this.player);
            document.body.appendChild(this.app.renderer.view);
            PIXI.Ticker.shared.add(() => this.app.renderer.render(this.app.stage));

            //Init graph only after resources loaded
            initGame();
        });
    }

    /**
     * Render tiles
     * @param nodes 0-wall, 1-field
     */
    fillTileMap(nodes) {
        this.tilemap.clear();
        this.pathLine.clear();
        
        this.gridSize = nodes.length;
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                this.tilemap.tile(
                    nodes[j][i].weight
                        ? 'grass.png'
                        : 'brick.png',
                    i * 32,
                    j * 32,
                );
            }
        }    

        this.resizeTilemap();
    }

    // Resize tilemap to stage size
    resizeTilemap() {
        this.tilemap.width = this.app.renderer.width;
        this.tilemap.height = this.app.renderer.height;
        this.app.stage.scale.x = 1.0;
        this.app.stage.scale.y = 1.0;
        this.app.stage.filterArea = new PIXI.Rectangle(0, 0, this.app.renderer.width, this.app.renderer.height);

        var cellSize = 640/this.gridSize;
        this.player.height = cellSize;
        this.player.width = cellSize;
    }

    // Draw path line
    drawPath(path) {
        this.pathLine.clear();
        if(path.length < 2) return; // only clear line if path empty

        for (var i = 1; i < path.length; i++) {
            let coord1 = this.getCoordByTile(path[i-1]);
            let coord2 = this.getCoordByTile(path[i]);

            this.pathLine.lineStyle(4, 0xffffff)
                .moveTo(coord1.x, coord1.y)
                .lineTo(coord2.x, coord2.y);
        }
    }

    getTileByCoord(position)
    {
        var cellSize = 640/this.gridSize;
        return {x: Math.floor(position.y/cellSize), y:Math.floor(position.x/cellSize)};
    }

    getCoordByTile(tile)
    {
        var cellSize = 640/this.gridSize;
        return {x: tile.y*cellSize + cellSize/2, y: tile.x*cellSize + cellSize/2};
    }

    placePlayer(tile)
    {
        var coord = this.getCoordByTile(tile);
        this.player.x = coord.x;
        this.player.y = coord.y;
    }

    movePlayer(path)
    {
        this.pathLine.clear();
        var linePath = [];

        for (var i = 0;i < path.length; i++) {
            var coord = this.getCoordByTile(path[i]);
            linePath.push({x: coord.x, y: coord.y});
        }

        gsap.to(this.player, {
            duration: 1, 
            yoyo: false,
            ease: "none",
            motionPath: {
                autoRotate: 1.5708,
                path: linePath,
                curviness: 0,
                useRadians: true,
            }
        });
    }
}

/**
 * Graph init and path searching
 */
class GraphSearch {
    constructor(options, implementation) {
        this.search = implementation;
        this.opts = options;
    }

    /**
     * Inits random grid
     * @returns first non-wall field that would be used as player position
     */
    initialize = function() {
        var startSet = false,
            nodes = [], 
            firstEmpty;
    
        for(var x = 0; x < this.opts.gridSize; x++) {
            var nodeRow = [];
    
            for(var y = 0; y < this.opts.gridSize; y++) {
    
                var isField = Math.floor(Math.random()*(1/this.opts.wallFrequency));
                if(!isField) {
                    nodeRow.push(0);
                }
                else  {
                    nodeRow.push(1);
                    if (!startSet) {
                        firstEmpty = {x: x, y: y};
                        startSet = true;
                    }
                }
            }
            nodes.push(nodeRow);        
        }
    
        this.graph = new Graph(nodes);
        return firstEmpty;
    };

    // Sets grid size or walls percent
    setOption = function(opt) {
        this.opts = Object.assign( {}, this.opts, opt );//$.extend(this.opts, opt);
    };

    /**
     * Searches path between 2 tiles
     * @param start start tile
     * @param end end tile
     * @returns path
     */
    searchPath = function(start, end) {
        var startCell = this.graph.grid[start.x][start.y];
        var endCell = this.graph.grid[end.x][end.y];
        var path = this.search(this.graph, startCell, endCell);
        
        return path;
    };
}

var sceneRenderer = new SceneRenderer();
var graphSearch;
var playerPos;
var playerMoving = false;

function mouseMove(e)
{
    if(playerMoving) return; // ignore if player is moving

    var tile = sceneRenderer.getTileByCoord(e.data.global);
    var path = graphSearch.searchPath(playerPos, tile);
    
    path.unshift(playerPos); // insert player pos as first coord
    sceneRenderer.drawPath(path);
}

function mouseClick(e)
{
    if(playerMoving) return; // ignore if player is moving
    var tile = sceneRenderer.getTileByCoord(e.data.global);
    var path = graphSearch.searchPath(playerPos, tile);
    
    if(path.length == 0) return;

    path.unshift(playerPos);
    sceneRenderer.movePlayer(path);
    
    playerMoving = true;
    setTimeout(() => playerMoving = false, 1000);

    if (path.length !=0) playerPos = {x:path[path.length-1].x, y:path[path.length-1].y};
}

function initGame() {
    gsap.registerPlugin(MotionPathPlugin);
    var opts = {
        wallFrequency: document.querySelector("#selectWallFrequency").value,
        gridSize: document.querySelector("#selectGridSize").value
    };

    graphSearch = new GraphSearch(opts, astar.search);
    makeScene();

    document.querySelector("#btnGenerate").onclick = function() {
        makeScene();
    }

    document.querySelector("#selectWallFrequency").onchange = function() {
        graphSearch.setOption({wallFrequency: this.value});
        makeScene();
    }

    document.querySelector("#selectGridSize").onchange = function() {
        graphSearch.setOption({gridSize: this.value});
        makeScene();
    }

    sceneRenderer.tilemap.mousemove = mouseMove;
    sceneRenderer.tilemap.click = mouseClick;
};

// Draw tiles and player
function makeScene()
{
    playerPos = graphSearch.initialize();
    sceneRenderer.fillTileMap(graphSearch.graph.grid);
    sceneRenderer.placePlayer(playerPos);
}