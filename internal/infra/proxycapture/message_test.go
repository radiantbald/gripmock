package proxycapture_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
	"google.golang.org/protobuf/types/known/wrapperspb"

	"github.com/radiantbald/gripmock/v3/internal/infra/proxycapture"
)

func TestMessageToMapKeepsNestedDefaultBool(t *testing.T) {
	t.Parallel()

	desc := mustSubmitAuthResponseDescriptor(t)
	msg := dynamicpb.NewMessage(desc)

	finishedFD := desc.Fields().ByName("finished")
	finished := dynamicpb.NewMessage(finishedFD.Message())

	tokensFD := finishedFD.Message().Fields().ByName("tokens")
	tokens := dynamicpb.NewMessage(tokensFD.Message())
	tokens.Set(tokensFD.Message().Fields().ByName("access_token"), protoreflect.ValueOfString("access"))
	tokens.Set(tokensFD.Message().Fields().ByName("refresh_token"), protoreflect.ValueOfString("refresh"))

	finished.Set(tokensFD, protoreflect.ValueOfMessage(tokens))
	finished.Set(finishedFD.Message().Fields().ByName("do_onboard"), protoreflect.ValueOfBool(false))

	msg.Set(finishedFD, protoreflect.ValueOfMessage(finished))
	msg.Set(desc.Fields().ByName("submit_result"), protoreflect.ValueOfString("authfinished"))

	got := proxycapture.MessageToMap(msg)
	require.Equal(t, "authfinished", got["submit_result"])

	finishedMap, ok := got["finished"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, false, finishedMap["do_onboard"])
	require.NotContains(t, finishedMap, "sibling")

	tokensMap, ok := finishedMap["tokens"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "access", tokensMap["access_token"])
	require.Equal(t, "refresh", tokensMap["refresh_token"])
}

func TestMessageToMapNilMessage(t *testing.T) {
	t.Parallel()

	require.Nil(t, proxycapture.MessageToMap(nil))
}

func TestMessageToMapIncludesDefaultScalar(t *testing.T) {
	t.Parallel()

	got := proxycapture.MessageToMap(&wrapperspb.DoubleValue{})
	require.Equal(t, map[string]any{"value": 0.0}, got)
}

func TestMessageToMapKeepsDefaultTotalPoints(t *testing.T) {
	t.Parallel()

	desc := mustLearningProfileResponseDescriptor(t)
	msg := dynamicpb.NewMessage(desc)
	msg.Set(desc.Fields().ByName("user_id"), protoreflect.ValueOfString("user-1"))

	profileFD := desc.Fields().ByName("profile")
	profile := dynamicpb.NewMessage(profileFD.Message())
	profile.Set(profileFD.Message().Fields().ByName("name"), protoreflect.ValueOfString("alice"))
	msg.Set(profileFD, protoreflect.ValueOfMessage(profile))

	got := proxycapture.MessageToMap(msg)
	require.Equal(t, "user-1", got["user_id"])
	require.Equal(t, json.Number("0"), got["total_points"])
	require.NotContains(t, got, "sibling")

	profileMap, ok := got["profile"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "alice", profileMap["name"])
	require.Equal(t, json.Number("0"), profileMap["total_points"])
}

func mustSubmitAuthResponseDescriptor(t *testing.T) protoreflect.MessageDescriptor { //nolint:ireturn
	t.Helper()

	file := &descriptorpb.FileDescriptorProto{
		Name:    proto.String("submit_auth.proto"),
		Package: proto.String("ident.bff.v1"),
		Syntax:  proto.String("proto3"),
		MessageType: []*descriptorpb.DescriptorProto{
			{
				Name: proto.String("Tokens"),
				Field: []*descriptorpb.FieldDescriptorProto{
					stringField("access_token", 1),
					stringField("refresh_token", 2),
				},
			},
			{
				Name: proto.String("Sibling"),
				Field: []*descriptorpb.FieldDescriptorProto{
					stringField("note", 1),
				},
			},
			{
				Name: proto.String("Finished"),
				Field: []*descriptorpb.FieldDescriptorProto{
					messageField("tokens", 1, ".ident.bff.v1.Tokens"),
					boolField("do_onboard", 2),
					messageField("sibling", 3, ".ident.bff.v1.Sibling"),
				},
			},
			{
				Name: proto.String("SubmitAuthResponse"),
				Field: []*descriptorpb.FieldDescriptorProto{
					messageField("finished", 1, ".ident.bff.v1.Finished"),
					stringField("submit_result", 2),
				},
			},
		},
	}

	fd, err := protodesc.NewFile(file, nil)
	require.NoError(t, err)

	desc := fd.Messages().ByName("SubmitAuthResponse")
	require.NotNil(t, desc)

	return desc
}

func mustLearningProfileResponseDescriptor(t *testing.T) protoreflect.MessageDescriptor { //nolint:ireturn
	t.Helper()

	file := &descriptorpb.FileDescriptorProto{
		Name:    proto.String("learning_profile.proto"),
		Package: proto.String("learning.v1"),
		Syntax:  proto.String("proto3"),
		MessageType: []*descriptorpb.DescriptorProto{
			{
				Name: proto.String("Profile"),
				Field: []*descriptorpb.FieldDescriptorProto{
					int32Field("total_points", 1),
					stringField("name", 2),
				},
			},
			{
				Name: proto.String("Sibling"),
				Field: []*descriptorpb.FieldDescriptorProto{
					stringField("note", 1),
				},
			},
			{
				Name: proto.String("GetUserLearningProfileResponse"),
				Field: []*descriptorpb.FieldDescriptorProto{
					int32Field("total_points", 1),
					stringField("user_id", 2),
					messageField("profile", 3, ".learning.v1.Profile"),
					messageField("sibling", 4, ".learning.v1.Sibling"),
				},
			},
		},
	}

	fd, err := protodesc.NewFile(file, nil)
	require.NoError(t, err)

	desc := fd.Messages().ByName("GetUserLearningProfileResponse")
	require.NotNil(t, desc)

	return desc
}

func stringField(name string, number int32) *descriptorpb.FieldDescriptorProto {
	return scalarField(name, number, descriptorpb.FieldDescriptorProto_TYPE_STRING)
}

func boolField(name string, number int32) *descriptorpb.FieldDescriptorProto {
	return scalarField(name, number, descriptorpb.FieldDescriptorProto_TYPE_BOOL)
}

func int32Field(name string, number int32) *descriptorpb.FieldDescriptorProto {
	return scalarField(name, number, descriptorpb.FieldDescriptorProto_TYPE_INT32)
}

func scalarField(name string, number int32, fieldType descriptorpb.FieldDescriptorProto_Type) *descriptorpb.FieldDescriptorProto {
	return &descriptorpb.FieldDescriptorProto{
		Name:   proto.String(name),
		Number: proto.Int32(number),
		Label:  descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
		Type:   fieldType.Enum(),
	}
}

func messageField(name string, number int32, typeName string) *descriptorpb.FieldDescriptorProto {
	return &descriptorpb.FieldDescriptorProto{
		Name:     proto.String(name),
		Number:   proto.Int32(number),
		Label:    descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
		Type:     descriptorpb.FieldDescriptorProto_TYPE_MESSAGE.Enum(),
		TypeName: proto.String(typeName),
	}
}
