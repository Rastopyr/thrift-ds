# Thrift data structures

## How it works

This is library provide simple api to work with Thrift data structures from
thrift definition.

```js
import Thrift from "thrift";

const thriftStr = `
struct Example {
    1:  string                stringProperty,
    2:  noolean               booleanProperty,
    3:  i64                   i64Property
}

struct NextExample {
    1:  string                anotherStringProperty,
    2:  Example               exampleRef
}
`;

const thrift = Thrift(thriftStr);

const example = thrift.Example();
const nextExample = thrift.NextExample();

example.stringProperty = "someString value";
example.booleanProperty = false;

nextExample.anotherStringProperty = "someAnotherString";
nextExample.exampleRef = example;

// will output buffer
console.log(nextExample.toString());

// will output buffer
console.log(nextExample.toString());
```
