Deps.autorun(function() {

  //Editor
  Meteor.subscribe(
    'resources_from_id',
    Session.get('resource_id')
  );
  Meteor.subscribe(
    'open_flags',
    Session.get('county')
  );

  //Home
  if (Session.get('display_services') && Session.get('display_services').length == SIDEBAR_NUM) {
    Meteor.subscribe(
      'resources_from_services',
      Session.get('display_services'),
      Session.get('county'),
      function() {
        var service_ids = Session.get('display_services').map(
          function(service) {return service._id}
        );

        map.remove_all_markers();

        Resources.find({sub_service_ids:{$in:service_ids}, service_areas:Session.get('county')._id}).forEach(
          function(resource) {
            add_marker(resource)
          }
        )
      }
    )
  }

});
