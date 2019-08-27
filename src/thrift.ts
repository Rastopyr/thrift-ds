import { createHash } from "crypto";
import BigNumber from "big-integer";
import {
  ThriftDocument,
  FieldDefinition,
  SyntaxType,
  parse,
  ListType,
  ThriftStatement
} from "@creditkarma/thrift-parser";

export function md5(value: string | Buffer) {
  return createHash("md5")
    .update(value)
    .digest("hex");
}

export const TYPE_STOP = 0x00;
export const TYPE_TRUE = 0x01;
export const TYPE_FALSE = 0x02;
export const TYPE_BYTE = 0x03;
export const TYPE_I16 = 0x04;
export const TYPE_I32 = 0x05;
export const TYPE_I64 = 0x06;
export const TYPE_DOUBLE = 0x07;
export const TYPE_BINARY = 0x08;
export const TYPE_LIST = 0x09;
export const TYPE_SET = 0x0a;
export const TYPE_MAP = 0x0b;
export const TYPE_STRUCT = 0x0c;
export const TYPE_FLOAT = 0x0d;

const Compact = {
  TYPE_STOP,
  TYPE_TRUE,
  TYPE_FALSE,
  TYPE_BYTE,
  TYPE_I16,
  TYPE_I32,
  TYPE_I64,
  TYPE_DOUBLE,
  TYPE_BINARY,
  TYPE_LIST,
  TYPE_SET,
  TYPE_MAP,
  TYPE_STRUCT,
  TYPE_FLOAT
};

const ThriftCompact = {
  [SyntaxType.TrueKeyword]: TYPE_TRUE,
  [SyntaxType.FalseKeyword]: TYPE_FALSE,
  [SyntaxType.ByteKeyword]: TYPE_BYTE,
  [SyntaxType.StringKeyword]: TYPE_BINARY,
  [SyntaxType.I16Keyword]: TYPE_I16,
  [SyntaxType.I32Keyword]: TYPE_I32,
  [SyntaxType.I64Keyword]: TYPE_I64,
  [SyntaxType.DoubleKeyword]: TYPE_DOUBLE,
  [SyntaxType.BinaryKeyword]: TYPE_BINARY,
  [SyntaxType.ListType]: TYPE_LIST,
  [SyntaxType.SetType]: TYPE_SET,
  [SyntaxType.MapType]: TYPE_MAP,
  [SyntaxType.FalseKeyword]: TYPE_FLOAT
};

export class Writer {
  constructor(
    private buffer = Buffer.from(""),
    private field = 0,
    private stack: number[] = []
  ) {}

  toZigZag(number: any, bits: number) {
    const num: BigNumber.BigInteger = BigNumber(number, 10);

    return num.shiftLeft(1).xor(num.shiftRight(bits - 1));
  }

  pushToBuffer(value: string | Buffer) {
    const concatValue = Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii');

    this.buffer = Buffer.concat([this.buffer, concatValue]);
  }

  writeByte(number: number) {
    this.pushToBuffer(String.fromCharCode(number));
  }

  writeWord(word: string | number) {
    this.writeVarint(this.toZigZag(word, 16).toString());
  }

  writeInt(int: string | number) {
    this.writeVarint(this.toZigZag(int, 32).toString());
  }

  writeLongInt(longInt: string | number) {
    this.writeVarint(this.toZigZag(longInt, 64).toString());
  }

  writeField(field: number, type: number) {
    let delta = field - this.field;

    if (0 < delta && delta <= 15) {
      this.writeByte((delta << 4) | type);
    } else {
      this.writeByte(type);
      this.writeWord(field);
    }

    this.field = field;
  }

  writeVarint(varint: number | string) {
    let num = BigNumber(varint as string);

    while (true) {
      const byte = num.and(~0x7f);

      if (byte.toJSNumber() === 0) {
        this.pushToBuffer(String.fromCharCode(num.toJSNumber()));
        break;
      } else {
        // let b = (number & 0xff) | 0x80;
        this.pushToBuffer(
          String.fromCharCode(
            num
              .and(0xff)
              .or(0x80)
              .toJSNumber()
          )
        );

        num = num.shiftRight(7);
      }
    }
  }

  writeBinary(data: string | Buffer) {
    this.pushToBuffer(data);
  }

  writeBool(field: number, value: boolean) {
    this.writeField(field, value ? Compact.TYPE_TRUE : Compact.TYPE_FALSE);
  }

  writeString(field: number, string: string) {
    this.writeField(field, Compact.TYPE_BINARY);
    this.writeVarint(string.length);
    this.writeBinary(string);
  }

  writeStop() {
    this.pushToBuffer(String.fromCharCode(Compact.TYPE_STOP));

    if (this.stack.length) {
      this.field = this.stack.pop() || 0;
    }
  }

  writeInt8(field: number, int: number) {
    this.writeField(field, Compact.TYPE_BYTE);
    this.writeByte(int);
  }

  writeInt16(field: number, int: number) {
    this.writeField(field, Compact.TYPE_I16);
    this.writeWord(int);
  }

  writeInt32(field: number, int: number) {
    this.writeField(field, Compact.TYPE_I32);
    this.writeInt(int);
  }

  writeInt64(field: number, int: string) {
    this.writeField(field, Compact.TYPE_I64);
    this.writeLongInt(int);
  }

  writeList(field: number, type: number, list: any[]) {
    this.writeField(field, Compact.TYPE_LIST);
    const size = list.length;

    if (size < 0x0f) {
      this.writeByte((size << 4) | type);
    } else {
      this.writeByte(0xf0 | type);
      this.writeVarint(size);
    }

    switch (type) {
      case Compact.TYPE_TRUE:
      case Compact.TYPE_FALSE:
        list.forEach(value => {
          this.writeByte(value ? Compact.TYPE_TRUE : Compact.TYPE_FALSE);
        });
        break;
      case Compact.TYPE_BYTE:
        list.forEach(number => {
          this.writeByte(number);
        });
        break;
      case Compact.TYPE_I16:
        list.forEach(number => {
          this.writeWord(number);
        });
        break;
      case Compact.TYPE_I32:
        list.forEach(number => {
          this.writeInt(number);
        });
        break;
      case Compact.TYPE_I64:
        list.forEach(number => {
          this.writeLongInt(number);
        });
        break;
      case Compact.TYPE_BINARY:
        list.forEach(string => {
          this.writeVarint(string.length);
          this.writeBinary(string);
        });
        break;
    }
  }

  writeStruct(field: number) {
    this.writeField(field, Compact.TYPE_STRUCT);
    this.stack.push(field);
    this.field = 0;
  }

  getBuffer() {
    return this.buffer;
  }

  toString() {
    return this.buffer.toString();
  }
}

export class ThriftProxyHandler implements ProxyHandler<{}> {
  constructor(
    private readonly writer: Writer,
    private readonly fields: FieldDefinition[],
  ) {}

  set(target: any, propName: string, value: any) {
    const field = this.fields.find(({ name }: FieldDefinition) => {
      return name.value === propName;
    });

    if (!field) {
      throw new Error(`field ${propName} not exist in struct`);
    }

    if (!field.fieldID) {
      throw new Error(`field ${propName} not have \`fieldID\` in thrift file`);
    }

    const {
      fieldType: { type },
      fieldID: { value: idValue }
    } = field;

    switch (type) {
      case SyntaxType.StringKeyword:
        this.writer.writeString(idValue, value);
        break;

      case SyntaxType.ListType:
        const { fieldType } = field;
        const {
          valueType: { type }
        } = fieldType as ListType;

        this.writer.writeList(idValue, ThriftCompact[type as SyntaxType.ListType], value);
        break;

      case SyntaxType.Identifier:
        this.writer.writeField(idValue, Compact.TYPE_STRUCT);
        // console.log(value)
        if (value instanceof ThriftProxyObject) {
          this.writer.writeBinary(value.toString());
        } else if(typeof value === 'string') {
          this.writer.writeBinary(value);
        }

        this.writer.writeStop();

        break;

      default:
        break;
    }

    target[propName] = value;

    return true;
  }
}

export class ThriftProxyObject {
  constructor(private readonly writer: Writer) {}

  toString() {
    return this.writer.getBuffer();
  }
}

const thriftStruct = (
  fields: FieldDefinition[],
) => {
  return () => {
    const writer = new Writer();
    const proxyObject = new ThriftProxyObject(writer);
    const proxyHandler = new ThriftProxyHandler(writer, fields);

    return new Proxy(proxyObject, proxyHandler);
  };
};

const thriftNamespace = (ast: ThriftDocument) => {
  const struct: any = {};
  const { body }: { body: ThriftStatement[] } = ast;

  for (const statement of body) {
    switch (statement.type) {
      case SyntaxType.StructDefinition:
        struct[statement.name.value] = thriftStruct(
          statement.fields,
        );
        break;
      default:
        break;
    }
  }

  return struct;
};

export const createThrift = (template: string) => {
  const templateAst = parse(template);

  switch (templateAst.type) {
    case "ThriftDocument":
      return thriftNamespace(templateAst);
    case "ThriftErrors":
      console.log("errors", templateAst);
  }
};
