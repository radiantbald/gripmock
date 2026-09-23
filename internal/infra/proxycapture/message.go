package proxycapture

import (
	"encoding/base64"
	"encoding/json"
	"strconv"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func MessageToMap(message proto.Message) map[string]any {
	if message == nil {
		return nil
	}

	return messageToMap(message.ProtoReflect())
}

func messageToMap(message protoreflect.Message) map[string]any {
	if !message.IsValid() {
		return nil
	}

	desc := message.Descriptor()
	result := make(map[string]any, desc.Fields().Len())

	for i := range desc.Fields().Len() {
		fd := desc.Fields().Get(i)
		if !includeField(message, fd) {
			continue
		}

		result[string(fd.Name())] = convertField(fd, message.Get(fd))
	}

	return result
}

func includeField(message protoreflect.Message, fd protoreflect.FieldDescriptor) bool {
	if fd.IsList() || fd.IsMap() || fd.Message() != nil {
		return message.Has(fd)
	}

	if oneof := fd.ContainingOneof(); oneof != nil && !oneof.IsSynthetic() {
		return message.Has(fd)
	}

	return true
}

func convertField(fd protoreflect.FieldDescriptor, value protoreflect.Value) any {
	switch {
	case fd.IsList():
		return convertList(fd, value.List())
	case fd.IsMap():
		return convertMapField(fd, value.Map())
	default:
		return convertScalar(fd, value)
	}
}

func convertList(fd protoreflect.FieldDescriptor, list protoreflect.List) []any {
	result := make([]any, list.Len())
	elemType := fd.Message()

	for i := range list.Len() {
		elem := list.Get(i)
		if elemType != nil {
			result[i] = messageToMap(elem.Message())
		} else {
			result[i] = convertScalar(fd, elem)
		}
	}

	return result
}

func convertMapField(fd protoreflect.FieldDescriptor, values protoreflect.Map) map[string]any {
	result := make(map[string]any)
	valType := fd.MapValue().Message()

	values.Range(func(key protoreflect.MapKey, val protoreflect.Value) bool {
		convertedKey := mapKeyString(fd.MapKey(), key)
		if valType != nil {
			result[convertedKey] = messageToMap(val.Message())
		} else {
			result[convertedKey] = convertScalar(fd.MapValue(), val)
		}

		return true
	})

	return result
}

func mapKeyString(fd protoreflect.FieldDescriptor, key protoreflect.MapKey) string {
	switch fd.Kind() {
	case protoreflect.BoolKind:
		return strconv.FormatBool(key.Bool())
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind,
		protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		return strconv.FormatInt(key.Int(), 10)
	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind,
		protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		return strconv.FormatUint(key.Uint(), 10)
	default:
		return key.String()
	}
}

//nolint:cyclop
func convertScalar(fd protoreflect.FieldDescriptor, value protoreflect.Value) any {
	const nullValue = "google.protobuf.NullValue"

	switch fd.Kind() {
	case protoreflect.BoolKind:
		return value.Bool()
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind,
		protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		return json.Number(value.String())
	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind,
		protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		return json.Number(value.String())
	case protoreflect.FloatKind:
		return float64(value.Float())
	case protoreflect.DoubleKind:
		return value.Float()
	case protoreflect.StringKind:
		return value.String()
	case protoreflect.BytesKind:
		return base64.StdEncoding.EncodeToString(value.Bytes())
	case protoreflect.EnumKind:
		if fd.Enum().FullName() == nullValue {
			return nil
		}

		desc := fd.Enum().Values().ByNumber(value.Enum())
		if desc != nil {
			return string(desc.Name())
		}

		return ""
	case protoreflect.MessageKind, protoreflect.GroupKind:
		return messageToMap(value.Message())
	default:
		return nil
	}
}
