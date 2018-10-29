const fs = require('fs')
const DEFS = require('./const')
const trimString = require('./util').trimString
const nullpadString = require('./util').nullpadString
const EOD_MARKER = require('./const').EOD_MARKER
const EOF_MARKER = require('./const').EOF_MARKER

/**
 * Class containing all level attributes.
 * @example
 * let level = new Level()
 */
class Level {
  /**
  * Represents a level.
  * @constructor
  */
  constructor () {
    this.version = 'Elma'
    this.link = 0
    this.integrity = [0.0, 0.0, 0.0, 0.0]
    this.lgr = 'default'
    this.name = 'New level'
    this.ground = 'ground'
    this.sky = 'sky'
    this.polygons = [{ grass: false, vertices: [{ x: 10.0, y: 0.0 }, { x: 10.0, y: 7.0 }, { x: 0.0, y: 7.0 }, { x: 0.0, y: 0.0 }] }]
    this.objects = [{ x: 2.0, y: 7.0 - DEFS.OBJECT_RADIUS, type: 'start' },
                    { x: 8.0, y: 7.0 - DEFS.OBJECT_RADIUS, type: 'exit' }]
    this.pictures = []
    this.top10 = {
      single: [],
      multi: []
    }
  }

  /**
   * Loads a level from file.
   * @static
   * @param {string} filePath Path to file
   * @returns {Promise}
   */
  static load (filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (error, buffer) => {
        if (error) reject(error)
        let level = new Level()
        // remove default polygons and objects
        level.polygons = []
        level.objects = []
        level._parseFile(buffer).then(results => resolve(results)).catch(error => reject(error))
      })
    })
  }

  /**
   * Parses file buffer data into a Level.
   * @private
   * @returns {Promise}
   */
  _parseFile (buffer) {
    return new Promise((resolve, reject) => {
      let offset = 0

      // check version
      let version = buffer.toString('ascii', 0, 5)
      switch (version) {
        case 'POT06':
          reject('Across levels are not supported')
          return
        case 'POT14':
          this.version = 'Elma'
          break
        default:
          reject('Not valid Elma level.')
          return
      }
      offset += 7 // 2 extra garbage bytes

      // link
      this.link = buffer.readUInt32LE(offset)
      offset += 4

      // integrity sums
      for (let i = 0; i < 4; i++) {
        this.integrity[i] = buffer.readDoubleLE(offset)
        offset += 8
      }

      // level name
      this.name = trimString(buffer.slice(offset, offset + 51))
      offset += 51
      // lgr
      this.lgr = trimString(buffer.slice(offset, offset + 16))
      offset += 16
      // ground
      this.ground = trimString(buffer.slice(offset, offset + 10))
      offset += 10
      // sky
      this.sky = trimString(buffer.slice(offset, offset + 10))
      offset += 10

      // polygons
      let polyCount = buffer.readDoubleLE(offset) - 0.4643643
      offset += 8
      for (let i = 0; i < polyCount; i++) {
        let polygon = {}
        polygon.grass = Boolean(buffer.readInt32LE(offset))
        polygon.vertices = []
        offset += 4
        let vertexCount = buffer.readInt32LE(offset)
        offset += 4
        for (let j = 0; j < vertexCount; j++) {
          let vertex = {}
          vertex.x = buffer.readDoubleLE(offset)
          offset += 8
          vertex.y = buffer.readDoubleLE(offset)
          offset += 8
          polygon.vertices.push(vertex)
        }
        this.polygons.push(polygon)
      }

      // objects
      let objectCount = buffer.readDoubleLE(offset) - 0.4643643
      offset += 8
      for (let i = 0; i < objectCount; i++) {
        let object = {}
        object.x = buffer.readDoubleLE(offset)
        offset += 8
        object.y = buffer.readDoubleLE(offset)
        offset += 8
        let objType = buffer.readInt32LE(offset)
        offset += 4
        let gravity = buffer.readInt32LE(offset)
        offset += 4
        let animation = buffer.readInt32LE(offset) + 1
        offset += 4
        switch (objType) {
          case 1:
            object.type = 'exit'
            break
          case 2:
            object.type = 'apple'
            switch (gravity) {
              case 0:
                object.gravity = 'normal'
                break
              case 1:
                object.gravity = 'up'
                break
              case 2:
                object.gravity = 'down'
                break
              case 3:
                object.gravity = 'left'
                break
              case 4:
                object.gravity = 'right'
                break
              default:
                reject('Invalid gravity value')
                return
            }
            object.animation = animation
            break
          case 3:
            object.type = 'killer'
            break
          case 4:
            object.type = 'start'
            break
          default:
            reject('Invalid object value')
            return
        }
        this.objects.push(object)
      }

      // pictures
      let picCount = buffer.readDoubleLE(offset) - 0.2345672
      offset += 8
      for (let i = 0; i < picCount; i++) {
        let picture = {}
        picture.name = trimString(buffer.slice(offset, offset + 10))
        offset += 10
        picture.texture = trimString(buffer.slice(offset, offset + 10))
        offset += 10
        picture.mask = trimString(buffer.slice(offset, offset + 10))
        offset += 10
        picture.x = buffer.readDoubleLE(offset)
        offset += 8
        picture.y = buffer.readDoubleLE(offset)
        offset += 8
        picture.distance = buffer.readInt32LE(offset)
        offset += 4
        let clip = buffer.readInt32LE(offset)
        offset += 4
        switch (clip) {
          case 0:
            picture.clip = 'unclipped'
            break
          case 1:
            picture.clip = 'ground'
            break
          case 2:
            picture.clip = 'sky'
            break
          default:
            reject('Invalid clip value')
            return
        }
        this.pictures.push(picture)
      }

      // end of data marker
      if (buffer.readInt32LE(offset) !== EOD_MARKER) {
        reject('End of data marker error')
        return
      }
      offset += 4

      // top10 lists
      let top10Data = Level.cryptTop10(buffer.slice(offset, offset + 688))
      this.top10.single = this._parseTop10(top10Data.slice(0, 344))
      this.top10.multi = this._parseTop10(top10Data.slice(344))
      offset += 688

      // EOF marker
      if (buffer.readInt32LE(offset) !== EOF_MARKER) {
        reject('End of file marker error')
        return
      }

      resolve(this)
    })
  }

  /**
   * Encrypts and decrypts top10 list data.
   * @static
   * @param {Buffer} buffer Data to encrypt or decrypt
   * @returns {Buffer} Buffer with binary data
   */
  static cryptTop10 (buffer) {
    let output = Buffer.from(buffer) // copy buffer to not modify reference?
    let ebp8 = 0x15
    let ebp10 = 0x2637

    for (let i = 0; i < 688; i++) {
      output[i] ^= ebp8 & 0xFF
      // sick domi modifications to work with JS
      ebp10 += (ebp8 % 0xD3D) * 0xD3D
      ebp8 = ebp10 * 0x1F + 0xD3D
      ebp8 = (ebp8 & 0xFFFF) - 2 * (ebp8 & 0x8000)
    }

    return output
  }

  /**
   * Parses top10 list data and returns array with times.
   * @private
   * @param {Buffer} buffer
   * @returns {Array} times
   */
  _parseTop10 (buffer) {
    let top10Count = buffer.readInt32LE()
    let output = []
    for (let i = 0; i < top10Count; i++) {
      let timeOffset = 4 + i * 4
      let timeEnd = timeOffset + 4
      let nameOneOffset = 44 + i * 15
      let nameOneEnd = nameOneOffset + 15
      let nameTwoOffset = 194 + i * 15
      let nameTwoEnd = nameTwoOffset + 15
      let entry = {}
      entry.time = buffer.slice(timeOffset, timeEnd).readInt32LE()
      entry.name1 = trimString(buffer.slice(nameOneOffset, nameOneEnd))
      entry.name2 = trimString(buffer.slice(nameTwoOffset, nameTwoEnd))
      output.push(entry)
    }
    return output
  }

  _calculateIntegrity() {
    const pol_sum = this.polygons.reduce((accumulator, current) => {
      return (
        accumulator +
        current.vertices.reduce((accumulator, current) => {
          return accumulator + current.x + current.y;
        }, 0)
      );
    }, 0);
  
    const obj_sum = this.objects.reduce((acc, val) => {
      let obj_val = 0;
      if (val.type === "exit") obj_val = 1;
      else if (val.type === "apple") obj_val = 2;
      else if (val.type === "killer") obj_val = 3;
      else if (val.type === "start") obj_val = 4;
      return acc + val.x + val.y + obj_val;
    }, 0);
  
    const pic_sum = this.pictures.reduce((acc, val) => {
      return acc + val.x + val.y;
    }, 0);
  
    const sum = (pol_sum + obj_sum + pic_sum) * 3247.764325643;
  
    this.integrity = [
      sum,
      this._getRandomInt(0, 5871) + 11877 - sum,
      this._getRandomInt(0, 5871) + 11877 - sum,
      this._getRandomInt(0, 6102) + 12112 - sum
    ];
  }
  
  _getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }

  /**
   * Internal convinience method.
   * @private
   * @returns {Promise}
   */
  _update () {
    this._calculateIntegrity()
    return new Promise((resolve, reject) => {
      // figure out how big of a buffer to create since dynamic allocation is not a thing...
      let bufferSize = 850 // all known level attributes' size
      for (let i = 0; i < this.polygons.length; i++) {
        bufferSize += 8 + 16 * this.polygons[i].vertices.length
      }
      bufferSize += (28 * this.objects.length) + (54 * this.pictures.length)
      let buffer = Buffer.alloc(bufferSize)

      if (this.version !== 'Elma') {
        reject('Only Elma levels are supported')
        return
      }
      buffer.write('POT14', 0, 'ascii')
      buffer.writeUInt16LE(this.link & 0xFFFF, 5)
      buffer.writeUInt32LE(this.link, 7)
      for (let i = 0; i < this.integrity.length; i++) {
        buffer.writeDoubleLE(this.integrity[i], 11 + i * 8)
      }
      let name = nullpadString(this.name, 51)
      buffer.write(name, 43, 'ascii')
      let lgr = nullpadString(this.lgr, 16)
      buffer.write(lgr, 94, 'ascii')
      let ground = nullpadString(this.ground, 10)
      buffer.write(ground, 110, 'ascii')
      let sky = nullpadString(this.sky, 10)
      buffer.write(sky, 120, 'ascii')

      buffer.writeDoubleLE(this.polygons.length + 0.4643643, 130)
      let offset = 138 // unknown territory, time to keep track of offset!
      this.polygons.forEach(polygon => {
        buffer.writeInt32LE(polygon.grass ? 1 : 0, offset)
        offset += 4
        buffer.writeInt32LE(polygon.vertices.length, offset)
        offset += 4
        polygon.vertices.forEach(vertex => {
          buffer.writeDoubleLE(vertex.x, offset)
          offset += 8
          buffer.writeDoubleLE(vertex.y, offset)
          offset += 8
        })
      })

      buffer.writeDoubleLE(this.objects.length + 0.4643643, offset)
      offset += 8
      this.objects.forEach(object => {
        let objectType
        let gravity = 0
        let animation = 0
        switch (object.type) {
          case 'exit':
            objectType = 1
            break
          case 'apple':
            objectType = 2
            switch (object.gravity) {
              case 'normal':
                gravity = 0
                break
              case 'up':
                gravity = 1
                break
              case 'down':
                gravity = 2
                break
              case 'left':
                gravity = 3
                break
              case 'right':
                gravity = 4
                break
              default:
                reject('Invalid gravity')
                return
            }
            animation = object.animation - 1
            break
          case 'killer':
            objectType = 3
            break
          case 'start':
            objectType = 4
            break
          default:
            reject('Invalid object value')
            return
        }
        buffer.writeDoubleLE(object.x, offset)
        offset += 8
        buffer.writeDoubleLE(object.y, offset)
        offset += 8
        buffer.writeInt32LE(objectType, offset)
        offset += 4
        buffer.writeInt32LE(gravity, offset)
        offset += 4
        buffer.writeInt32LE(animation, offset)
        offset += 4
      })

      buffer.writeDoubleLE(this.pictures.length + 0.2345672, offset)
      offset += 8
      this.pictures.forEach(picture => {
        let name = nullpadString(picture.name, 10)
        buffer.write(name, offset, 'ascii')
        offset += 10
        let texture = nullpadString(picture.texture, 10)
        buffer.write(texture, offset, 'ascii')
        offset += 10
        let mask = nullpadString(picture.mask, 10)
        buffer.write(mask, offset, 'ascii')
        offset += 10
        buffer.writeDoubleLE(picture.x, offset)
        offset += 8
        buffer.writeDoubleLE(picture.y, offset)
        offset += 8
        buffer.writeInt32LE(picture.distance, offset)
        offset += 4
        let clip
        switch (picture.clip) {
          case 'unclipped':
            clip = 0
            break
          case 'ground':
            clip = 1
            break
          case 'sky':
            clip = 2
            break
          default:
            reject('Invalid clip value')
            return
        }
        buffer.writeInt32LE(clip, offset)
        offset += 4
      })

      buffer.writeInt32LE(EOD_MARKER, offset)
      offset += 4
      this._top10ToBuffer().copy(buffer, offset)
      offset += 688
      buffer.writeInt32LE(EOF_MARKER, offset)

      resolve(buffer)
    })
  }

  /**
   * Parse top10 lists from Level class and return buffer with data.
   * @private
   * @returns {Buffer} buffer
   */
  _top10ToBuffer () {
    let self = this
    function parse (multi) {
      let list = multi ? 'multi' : 'single'
      self.top10[list].sort((a, b) => {
        if (a.time > b.time) return 1
        if (a.time < b.time) return -1
        return 0
      })
      let buffer = Buffer.alloc(344)
      buffer.writeUInt32LE(self.top10[list].length >= 10 ? 10 : self.top10[list].length)

      for (let i = 0; i < self.top10[list].length; i++) {
        if (i < 10) {
          buffer.writeUInt32LE(self.top10[list][i].time, 4 + 4 * i)
          buffer.write(nullpadString(self.top10[list][i].name1, 15), 44 + 15 * i)
          buffer.write(nullpadString(self.top10[list][i].name2, 15), 194 + 15 * i)
        }
      }

      return buffer
    }

    let single = parse(false)
    let multi = parse(true)
    return Level.cryptTop10(Buffer.concat([single, multi], 688))
  }

  // /**
  //  * Topology check.
  //  * @returns {Promise}
  //  */
  // checkTopology () {
  //   return new Promise((resolve, reject) => {
  //     resolve()
  //     reject()
  //   })
  // }

  /**
   * Returns level as buffer data.
   * @returns {Promise}
   */
  toBuffer () {
    return this._update()
  }

  /**
   * Generate new link number.
   */
  generateLink () {
    let max32 = Math.pow(2, 32) - 1
    this.link = Math.floor(Math.random() * max32)
  }

  /**
   * Saves a level to file.
   * @param {string} filePath Path to file
   * @returns {Promise}
   */
  save (filePath) {
    return new Promise((resolve, reject) => {
      if (!filePath) reject('No filepath specified')
      this._update().then(buffer => {
        fs.writeFile(filePath, buffer, error => {
          if (error) reject(error)
          resolve()
        })
      }).catch(error => reject(error))
    })
  }
}

module.exports = Level
