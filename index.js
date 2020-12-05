window.mat4 = glMatrix.mat4
window.vec3 = glMatrix.vec3

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!success) {
    throw "could not compile shader:"+ source + gl.getShaderInfoLog(shader);
  }
  return shader;
}

function createProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
    throw ("program failed to link:" + gl.getProgramInfoLog(program));
  }
  return program;
}

function createProgramFromString(gl, vertex, fragment) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER,vertex)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragment)
  const program = createProgram(gl, vertexShader, fragmentShader)
  gl.useProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  return program
}

function createBufferInfo(gl, program, attr, data) {
  const attrL = gl.getAttribLocation(program, attr)
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  return { buffer, attr: attrL }
}

function getAndSetUniform(gl, program, attr, data) {
  const a = gl.getUniformLocation(program, attr)
  if (!data.length) {
    gl.uniform1f(a, data)
  } else if (data.length === 3) {
    gl.uniform3fv(a, new Float32Array(data))
  } else if (data.length === 4) {
    gl.uniform4fv(a, new Float32Array(data))
  } else {
    gl.uniformMatrix4fv(a,  false, data)
  }
  return a
}

function createGl() {
  const canvas = document.createElement('canvas')
  canvas.width = 300;
  canvas.height = 300;
  document.body.appendChild(canvas)
  const gl = canvas.getContext('webgl')
  gl.viewport(0,0,gl.drawingBufferWidth, gl.drawingBufferHeight)
  return gl;
}

function nm() {
  return mat4.create()
}

function nv() {
  return vec3.create()
}

function rad(deg) {
  return Math.PI * deg / 180
}

function createSuperShape(meridians = 70, parallels = 70) {
  const vertices = [], points = []

  function superShape(theta, m, n1, n2, n3, a = 1, b = 1) {
    return (Math.abs((1 / a) * Math.cos(m * theta / 4)) ** n2 + Math.abs((1 / b) * Math.sin(m * theta / 4)) ** n3) ** (-1 / n1)
  }

  let lat, lon, x, y, z, r1, r2;
  for (let i = 0; i <= parallels; ++i) {
    lat = i * Math.PI / parallels - (Math.PI / 2)
    r2 = superShape(lat, 10, 3, 0.2, 1)


    for (let j = 0; j <= meridians; ++j) {
      lon = j * 2 * Math.PI / meridians - Math.PI
      r1 = superShape(lon, 5.7, 0.5, 1, 2.5)

      x = r1 * Math.cos(lon) * r2 * Math.cos(lat)
      y = r1 * Math.sin(lon) * r2 * Math.cos(lat)
      z = r2 * Math.sin(lat)
      vertices.push([x, y, z])
    }
  }

  function tri(a, b, c) {
    points.push(...vertices[a], ...vertices[b], ...vertices[c])
  }
  function quad(a, b, c, d) {
    tri(a, d, c)
    tri(a, b, d)
  }

  const row = parallels + 1
  let p1, p2
  for (let i = 0; i < parallels; ++i) {
    for (let j = 0; j < meridians; ++j) {
      p1 = i * row + j
      p2 = p1 + row
      quad(p1, p1 + 1, p2, p2 + 1)
    }
  }

  return new Float32Array(points)
}

const gl = createGl()
const program = createProgramFromString(gl, `


  attribute vec4 aPos;
  attribute vec3 aNormal;

  uniform mat4 modelMat;
  uniform mat4 viewMat;
  uniform mat4 projMat;
  uniform mat4 normalMat;

  varying vec4 vPos;
  varying vec3 vNormal;

  void main() {
    vPos = modelMat * aPos;
    vNormal = mat3(normalMat) * aNormal;
    gl_Position = projMat * viewMat * vPos;
  }
`,`
  precision mediump float;

  struct Material {
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
    float shininess;
  };

  struct Light {
    vec4 position;
    vec3 direction;
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;

    float cutOff;
    float outerCutOff;
    float constant;
    float linear;
    float quadratic;
  };


  varying vec4 vPos;
  varying vec3 vNormal;

  uniform vec3 camera;
  uniform Light light;
  uniform Material material;


  void main() {
    vec3 normal = normalize(vNormal);
    vec3 pos = vPos.xyz;

    vec4 lightPos = light.position;

    vec3 ambient = light.ambient * material.ambient;

    vec3 surfaceToLight = normalize(lightPos.xyz - pos);
    
    float theta = dot(normalize(light.direction), surfaceToLight);
    float intensity = smoothstep(light.outerCutOff, light.cutOff, theta);

    vec3 lightDir = normalize(lightPos.w > 0. ? lightPos.xyz - pos : lightPos.xyz);
    vec3 diffuse = max(dot(normal, lightDir), 0.) * light.diffuse * material.diffuse;

    vec3 h = normalize(lightDir + normalize(camera - pos));
    vec3 specular = pow(max(dot(normal, h), 0.), material.shininess) * light.specular * material.specular;

    diffuse *= intensity;    
    specular *= intensity;


    float distance = length(lightPos.xyz - pos);
    float attenuation = 1. / (light.constant + light.linear * distance + light.quadratic * (distance * distance)); 

    gl_FragColor = vec4((ambient + diffuse + specular) * attenuation, 1.);
  }
`)

const sphere = createSuperShape()
const count = sphere.length / 3

const viewMat = mat4.lookAt(nm(), [0, 0, 10], [0, 0, 0], [0, 1, 0]);
const projMat = mat4.perspective(nm(), rad(13), gl.canvas.clientWidth / gl.canvas.clientHeight, 1, 2000);
const baseModelMat = mat4.fromXRotation(nm(), rad(35));

getAndSetUniform(gl, program, 'camera', [0, 0, 10])
getAndSetUniform(gl, program, 'light.position', [0, 0, 10, 1])
getAndSetUniform(gl, program, 'light.direction', [0, 0, 10])
getAndSetUniform(gl, program, 'light.ambient', [0.3, 0.3, 0.3])
getAndSetUniform(gl, program, 'light.diffuse', [1, 1, 1])
getAndSetUniform(gl, program, 'light.specular', [1, 1, 1])
getAndSetUniform(gl, program, 'light.cutOff', Math.cos(rad(2)))
getAndSetUniform(gl, program, 'light.outerCutOff', Math.cos(rad(2.1)))

getAndSetUniform(gl, program, 'light.constant', 1)
getAndSetUniform(gl, program, 'light.linear', 0.007)
getAndSetUniform(gl, program, 'light.quadratic', 0.0002)

getAndSetUniform(gl, program, 'material.ambient', [0.04, 0.68, 0.26])
getAndSetUniform(gl, program, 'material.diffuse', [0.04, 0.68, 0.26])
getAndSetUniform(gl, program, 'material.specular', [1, 1, 1])
getAndSetUniform(gl, program, 'material.shininess', 60)

getAndSetUniform(gl, program, 'viewMat', viewMat)
getAndSetUniform(gl, program, 'projMat', projMat)

const uModelMat = gl.getUniformLocation(program, 'modelMat');
const uNormalMat = gl.getUniformLocation(program, 'normalMat');

const posInfo = createBufferInfo(gl, program, 'aPos', sphere);
const normalInfo = createBufferInfo(gl, program, 'aNormal', sphere)

gl.enableVertexAttribArray(posInfo.attr);
gl.vertexAttribPointer(posInfo.attr, 3, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(normalInfo.attr);
gl.vertexAttribPointer(normalInfo.attr, 3, gl.FLOAT, false, 0, 0);

gl.enable(gl.DEPTH_TEST)
gl.enable(gl.CULL_FACE)
gl.clearColor(1, 1, 1, 1)

let rotate = 1, modelMat, normalMat;
function draw() {
  modelMat = mat4.rotateY(nm(), baseModelMat, rotate);
  normalMat = mat4.transpose(nm(), mat4.invert([], modelMat));
  gl.uniformMatrix4fv(uModelMat, false, modelMat);
  gl.uniformMatrix4fv(uNormalMat, false, normalMat);
  
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, count)

  rotate += 0.01
  requestAnimationFrame(draw)
}

draw()
