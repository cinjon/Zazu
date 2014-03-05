Meteor.publish('flags_from_user', function(user_id) {
  if (!user_id) {
    return null;
  } else {
    return Flags.find({open:true, user_id:user_id});
  }
});

Meteor.publish('counties', function() {
  return Counties.find();
});

Meteor.publish('inputs', function() {
  return Inputs.find();
});

Meteor.publish('open_flags', function() {
  return Flags.find({open:true})
});

Meteor.publish('resources', function() {
    return Resources.find({})
});

Meteor.publish('resources_from_ids', function(ids) {
    return Resources.find({_id:{$in:ids}});
});

//change to using zipcode
Meteor.publish('resources_in_zipcode', function() {
    return Resources.find({});
});

Meteor.publish('resources_from_services', function(services) {
  if (!services) {
    return [];
  }
  service_ids = services.map(function(service) {
    return service._id;
  });
  return Resources.find({sub_service_ids:{$in:service_ids}});
});

Meteor.publish('service_name_route', function(name_route) {
  return Services.find({name_route:name_route});
});

Meteor.publish('services', function() {
  return Services.find({});
});

//change to incorporate some metric
Meteor.publish('top_services', function() {
  return Services.find({});
});

Meteor.publish("user_roles", function(user_id) {
  return Meteor.users.find({_id:user_id}, {fields:{roles:true}});
});